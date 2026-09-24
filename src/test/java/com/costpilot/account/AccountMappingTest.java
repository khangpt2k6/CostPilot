package com.costpilot.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.Test;

// 4.2: pure mapping rules - no Spring, no DB
class AccountMappingTest {

	@Test
	void slugsAreLowercaseAsciiAndBounded() {
		assertThat(AccountService.slugify("Khang's Workspace")).isEqualTo("khang-s-workspace");
		assertThat(AccountService.slugify("Phạm Tuấn Khang")).isEqualTo("pham-tuan-khang");
		assertThat(AccountService.slugify("!!!")).isEqualTo("workspace");
		assertThat(AccountService.slugify("a".repeat(80))).hasSize(32);
	}

	@Test
	void githubProfileFallsBackToLoginWhenNameIsUnset() {
		var profile = AppOAuth2UserService.profileFromAttributes("github",
				Map.of("id", 42, "login", "octocat", "avatar_url", "https://x/a.png"));
		assertThat(profile.subject()).isEqualTo("42");
		assertThat(profile.displayName()).isEqualTo("octocat");
		assertThat(profile.email()).isNull();
		assertThat(profile.avatarUrl()).isEqualTo("https://x/a.png");
	}

	@Test
	void inviteNeverGrantsOwnership() {
		assertThatThrownBy(() -> new WorkspaceInvite(UUID.randomUUID(), "h", WorkspaceRole.OWNER, null,
				Instant.now().plusSeconds(60))).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void inviteStatusFollowsItsLifecycle() {
		Instant now = Instant.now();
		WorkspaceInvite invite = new WorkspaceInvite(UUID.randomUUID(), "h", WorkspaceRole.MEMBER, null,
				now.plusSeconds(60));
		assertThat(invite.status(now)).isEqualTo(WorkspaceInvite.Status.PENDING);
		assertThat(invite.status(now.plusSeconds(61))).isEqualTo(WorkspaceInvite.Status.EXPIRED);
		invite.accept(UUID.randomUUID(), now);
		assertThat(invite.status(now)).isEqualTo(WorkspaceInvite.Status.ACCEPTED);
		invite.revoke(now);
		assertThat(invite.status(now)).isEqualTo(WorkspaceInvite.Status.REVOKED);
	}

	@Test
	void inviteTokensHashDeterministically() {
		assertThat(WorkspaceService.hash("abc")).isEqualTo(WorkspaceService.hash("abc")).hasSize(64);
		assertThat(WorkspaceService.hash("abc")).isNotEqualTo(WorkspaceService.hash("abd"));
	}
}
