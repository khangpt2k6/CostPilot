package com.costpilot.approval;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import com.costpilot.TestcontainersConfiguration;
import com.costpilot.core.model.CanonicalChatRequest;
import com.costpilot.core.model.LedgerContext;
import com.costpilot.ledger.UsageRecordRepository;

// The race this guards against, in plain terms: an admin clicks "approve" on a parked
// request at the exact moment the background sweeper auto-expires it. Two threads both
// read the row as "pending" and both try to write a decision. Without a guard, the
// request can be forwarded to the provider (money spent) and then overwritten as
// "expired" - or approved twice and billed twice. Exactly one decision may win, and an
// expired request must never have cost anything.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class ApprovalDecisionRaceIT {

	@Autowired
	private PendingApprovalService parkService;

	@Autowired
	private ApprovalDecisionService decisions;

	@Autowired
	private PendingApprovalRepository pendingRepository;

	@Autowired
	private UsageRecordRepository usageRepository;

	@BeforeEach
	void clean() {
		pendingRepository.deleteAll();
		usageRepository.deleteAll();
	}

	private PendingApproval park() {
		CanonicalChatRequest request = new CanonicalChatRequest("gpt-4o-mini",
				List.of(new CanonicalChatRequest.Message("user", "hello race")), 64, false);
		LedgerContext ledger = new LedgerContext("acme", "race-team", "proj", "user", "test",
				"race-" + UUID.randomUUID());
		return parkService.park(request, ledger, "gpt-4o-mini", null, "over approval threshold", null);
	}

	// Each racer loads its own copy of the row, exactly like two HTTP requests or a
	// request + the sweeper would. The latch releases them in the same instant.
	private record RaceOutcome(int decided, int refused) {
	}

	private RaceOutcome race(List<Callable<Void>> racers) throws Exception {
		CountDownLatch start = new CountDownLatch(1);
		AtomicInteger decided = new AtomicInteger();
		AtomicInteger refused = new AtomicInteger();
		try (ExecutorService pool = Executors.newFixedThreadPool(racers.size())) {
			List<Future<Void>> futures = racers.stream().map(racer -> pool.submit(() -> {
				start.await();
				try {
					racer.call();
					decided.incrementAndGet();
				} catch (ApprovalDecisionService.NotPendingException lost) {
					refused.incrementAndGet();
				}
				return (Void) null;
			})).toList();
			start.countDown();
			for (Future<Void> f : futures) {
				f.get(60, TimeUnit.SECONDS);
			}
			pool.shutdown();
			assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
		}
		return new RaceOutcome(decided.get(), refused.get());
	}

	@Test
	void adminApprovalAndAutoExpiryRacingOnTheSameRequestProduceExactlyOneDecision() throws Exception {
		// run the race several times: a single pass can miss the window by luck
		for (int round = 0; round < 10; round++) {
			PendingApproval parked = park();
			PendingApproval adminCopy = pendingRepository.findById(parked.getId()).orElseThrow();
			PendingApproval sweeperCopy = pendingRepository.findById(parked.getId()).orElseThrow();

			RaceOutcome outcome = race(List.of(
					() -> { decisions.approve(adminCopy, "admin@acme"); return null; },
					() -> { decisions.expire(sweeperCopy); return null; }));

			PendingApproval decided = pendingRepository.findById(parked.getId()).orElseThrow();
			assertThat(outcome.decided()).as("round %d: exactly one decision wins", round).isEqualTo(1);
			assertThat(outcome.refused()).as("round %d: the loser is refused", round).isEqualTo(1);
			assertThat(decided.getState()).isIn(PendingApproval.State.approved, PendingApproval.State.expired);
			long billed = usageRepository.count();
			if (decided.getState() == PendingApproval.State.expired) {
				// an expired request never reached the provider, so it never cost anything
				assertThat(billed).as("round %d: expired request must not be billed", round).isZero();
			} else {
				assertThat(billed).as("round %d: approved request billed exactly once", round).isEqualTo(1);
				assertThat(decided.getStoredResponse()).contains("chat.completion");
			}
			usageRepository.deleteAll();
		}
	}

	@Test
	void manyAdminsRejectingTheSameRequestAtOnceRecordExactlyOneDecision() throws Exception {
		PendingApproval parked = park();
		int admins = 16;
		List<Callable<Void>> racers = new java.util.ArrayList<>();
		for (int i = 0; i < admins; i++) {
			String who = "admin-" + i;
			PendingApproval copy = pendingRepository.findById(parked.getId()).orElseThrow();
			racers.add(() -> { decisions.reject(copy, who, "no budget for this"); return null; });
		}

		RaceOutcome outcome = race(racers);

		assertThat(outcome.decided()).isEqualTo(1);
		assertThat(outcome.refused()).isEqualTo(admins - 1);
		PendingApproval decided = pendingRepository.findById(parked.getId()).orElseThrow();
		assertThat(decided.getState()).isEqualTo(PendingApproval.State.rejected);
		assertThat(decided.getDecidedBy()).startsWith("admin-");
		assertThat(usageRepository.count()).isZero();
	}

	@Test
	void approveRacingAgainstRejectNeverBillsARejectedRequest() throws Exception {
		for (int round = 0; round < 10; round++) {
			PendingApproval parked = park();
			PendingApproval approver = pendingRepository.findById(parked.getId()).orElseThrow();
			PendingApproval rejecter = pendingRepository.findById(parked.getId()).orElseThrow();

			RaceOutcome outcome = race(List.of(
					() -> { decisions.approve(approver, "admin-a"); return null; },
					() -> { decisions.reject(rejecter, "admin-b", "too expensive"); return null; }));

			PendingApproval decided = pendingRepository.findById(parked.getId()).orElseThrow();
			assertThat(outcome.decided()).as("round %d", round).isEqualTo(1);
			long billed = usageRepository.count();
			if (decided.getState() == PendingApproval.State.rejected) {
				assertThat(billed).as("round %d: rejected request must not be billed", round).isZero();
			} else {
				assertThat(decided.getState()).isEqualTo(PendingApproval.State.approved);
				assertThat(billed).as("round %d", round).isEqualTo(1);
			}
			usageRepository.deleteAll();
		}
	}
}
