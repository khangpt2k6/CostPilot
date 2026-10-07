package com.costpilot.approval;

import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.costpilot.execution.GovernedRequestExecutor;
import com.costpilot.api.dto.ChatCompletionResponse;
import com.costpilot.core.model.CanonicalChatRequest;
import com.costpilot.ledger.DecisionContext;
import com.costpilot.core.model.LedgerContext;

/**
 * Stage 8.2: the state machine that resumes or kills a parked request. Only the
 * pending -> approved | rejected | expired transition is allowed, exactly once
 * (guarded so a double-approve or approve-after-expire is a no-op). An approved
 * request replays through the shared governed executor - same routing, budget, meter,
 * and ledger as a live request - and its rendered response is stored on the handle.
 * Rejected and expired requests never reach a provider.
 */
@Service
public class ApprovalDecisionService {

	private static final Logger log = LoggerFactory.getLogger(ApprovalDecisionService.class);

	public record Outcome(PendingApproval pending, ChatCompletionResponse response) {
	}

	/** Thrown when a transition is attempted on an already-decided (non-pending) row. */
	public static class NotPendingException extends RuntimeException {
		public NotPendingException(UUID id, PendingApproval.State state) {
			super("approval " + id + " is already " + state);
		}
	}

	private final PendingApprovalRepository repository;
	private final RequestPayloadCodec codec;
	private final GovernedRequestExecutor executor;
	private final ResponseCodec responseCodec;

	public ApprovalDecisionService(PendingApprovalRepository repository, RequestPayloadCodec codec,
			GovernedRequestExecutor executor, ResponseCodec responseCodec) {
		this.repository = repository;
		this.codec = codec;
		this.executor = executor;
		this.responseCodec = responseCodec;
	}

	/**
	 * Approve: replay the parked request non-streaming through the governed executor
	 * (route + budget + forward + meter + ledger), store the rendered response, mark
	 * approved. The idempotency key is preserved so a replay of the approval is
	 * ledger-safe. A budget block at approval time still applies - the request may be
	 * auto-downgraded or 402 exactly as a live request would.
	 */
	@Transactional
	public Outcome approve(PendingApproval pending, String decidedBy) {
		// claim the decision BEFORE forwarding: if a concurrent expire/reject already won,
		// nothing reaches the provider and nothing is billed. If the forward below throws,
		// the transaction rolls the claim back and the row is pending again.
		claim(pending, PendingApproval.State.approved, decidedBy, "approved");
		CanonicalChatRequest request = codec.deserialize(pending.getRequestPayload());
		LedgerContext ledger = ledgerOf(pending);
		// approval granted: replay as a normal ALLOW on the requested model
		DecisionContext decision = DecisionContext.allow(ledger, request.model());
		ChatCompletionResponse response = executor.executeNonStreaming(request, decision, request.model(),
				pending.getMinTier(), GovernedRequestExecutor.HeaderSink.NONE);
		pending.setStoredResponse(responseCodec.serialize(response));
		repository.save(pending);
		log.info("approval approved id={} model={} decidedBy={}", pending.getId(), request.model(), decidedBy);
		return new Outcome(pending, response);
	}

	/** Reject: mark rejected with a reason. Never forwarded. */
	@Transactional
	public PendingApproval reject(PendingApproval pending, String decidedBy, String reason) {
		claim(pending, PendingApproval.State.rejected, decidedBy,
				reason != null && !reason.isBlank() ? reason : "rejected");
		log.info("approval rejected id={} decidedBy={} reason=\"{}\"", pending.getId(), decidedBy,
				pending.getDecisionReason());
		return pending;
	}

	/** Auto-reject on TTL expiry. Never forwarded. */
	@Transactional
	public PendingApproval expire(PendingApproval pending) {
		claim(pending, PendingApproval.State.expired, "system", "TTL expired");
		log.info("approval expired id={} expiredAt={}", pending.getId(), pending.getExpiresAt());
		return pending;
	}

	// The pending -> terminal transition is claimed with one conditional UPDATE, so two
	// writers racing on the same row (admin approve vs sweeper expire, two admins at once)
	// can never both succeed: the database serialises them and the second one updates
	// zero rows. The in-memory check is only a fast path for an already-decided handle.
	private void claim(PendingApproval pending, PendingApproval.State terminal, String decidedBy, String reason) {
		if (pending.getState() != PendingApproval.State.pending) {
			throw new NotPendingException(pending.getId(), pending.getState());
		}
		Instant now = Instant.now();
		int won = repository.decideIfPending(pending.getId(), terminal, decidedBy, reason, now,
				PendingApproval.State.pending);
		if (won == 0) {
			PendingApproval.State current = repository.findById(pending.getId())
					.map(PendingApproval::getState).orElse(pending.getState());
			throw new NotPendingException(pending.getId(), current);
		}
		// keep the caller's copy in step with the row it just claimed
		pending.decide(terminal, decidedBy, reason, now);
	}

	private static LedgerContext ledgerOf(PendingApproval p) {
		return new LedgerContext(p.getTenantId(), p.getTeamId(), p.getProjectId(), p.getUserId(),
				p.getEnvironment(), p.getIdempotencyKey());
	}
}
