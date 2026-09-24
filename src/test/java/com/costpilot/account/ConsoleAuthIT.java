package com.costpilot.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import com.costpilot.TestcontainersConfiguration;
import com.costpilot.security.AuthTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

// 4.2 acceptance: people log in, get a workspace, invite each other, and the role rules hold.
// Also proves the API-key chain is untouched (no session, no CSRF) now that a session chain
// shares the same controllers.
@SpringBootTest(properties = "costpilot.auth.dev-login.enabled=true")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ConsoleAuthIT {

	@Autowired
	private MockMvc mvc;

	private final ObjectMapper mapper = new ObjectMapper();

	private record Login(MockHttpSession session, JsonNode me) {

		String workspaceId() {
			return me.get("workspaces").get(0).get("id").asText();
		}
	}

	private Login login(String email) throws Exception {
		MockHttpSession session = new MockHttpSession();
		MvcResult result = mvc.perform(post("/auth/dev-login").session(session).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"" + email + "\",\"name\":\"" + email.split("@")[0] + "\"}"))
				.andExpect(status().isOk()).andReturn();
		return new Login(session, mapper.readTree(result.getResponse().getContentAsString()));
	}

	private static String email() {
		return "u-" + UUID.randomUUID() + "@example.com";
	}

	private JsonNode json(MvcResult r) throws Exception {
		return mapper.readTree(r.getResponse().getContentAsString());
	}

	@Test
	void firstLoginCreatesAnOwnedWorkspaceWithADefaultTeam() throws Exception {
		Login a = login(email());
		JsonNode ws = a.me().get("workspaces");
		assertThat(ws).hasSize(1);
		assertThat(ws.get(0).get("role").asText()).isEqualTo("owner");

		JsonNode teams = json(mvc.perform(get("/api/workspace/teams").session(a.session()))
				.andExpect(status().isOk()).andReturn());
		assertThat(teams.get(0).get("name").asText()).isEqualTo("default");
		assertThat(teams.get(0).get("projects").get(0).get("name").asText()).isEqualTo("default");
	}

	@Test
	void loggingInAgainReturnsTheSameAccount() throws Exception {
		String email = email();
		Login first = login(email);
		Login second = login(email);
		assertThat(second.me().get("user").get("id")).isEqualTo(first.me().get("user").get("id"));
		assertThat(second.me().get("workspaces")).hasSize(1);
	}

	@Test
	void unauthenticatedConsoleCallsGet401NotARedirect() throws Exception {
		mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
		mvc.perform(get("/admin/budgets")).andExpect(status().isUnauthorized());
	}

	@Test
	void writesWithoutCsrfAreRejected() throws Exception {
		Login a = login(email());
		mvc.perform(post("/api/workspace/teams").session(a.session())
				.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"no-csrf\"}"))
				.andExpect(status().isForbidden());
	}

	@Test
	void apiKeyCallsNeedNoSessionOrCsrf() throws Exception {
		mvc.perform(put("/admin/budgets").header("Authorization", "Bearer " + AuthTestSupport.ADMIN_KEY)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"scope\":\"team\",\"ref\":\"key-" + UUID.randomUUID() + "\",\"limit\":5}"))
				.andExpect(status().isOk());
	}

	@Test
	void ownerManagesBudgetsInTheirOwnWorkspaceOnly() throws Exception {
		Login a = login(email());
		Login b = login(email());
		mvc.perform(put("/admin/budgets").session(a.session()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"scope\":\"team\",\"ref\":\"default\",\"limit\":3}"))
				.andExpect(status().isOk());

		String aBudgets = mvc.perform(get("/admin/budgets").session(a.session()))
				.andReturn().getResponse().getContentAsString();
		assertThat(aBudgets).contains("\"ref\":\"default\"");
		String bBudgets = mvc.perform(get("/admin/budgets").session(b.session()))
				.andReturn().getResponse().getContentAsString();
		assertThat(bBudgets).isEqualTo("[]");

		// b cannot point the header at a's workspace
		mvc.perform(get("/admin/budgets").session(b.session()).header("X-Workspace-ID", a.workspaceId()))
				.andExpect(status().isForbidden());
	}

	@Test
	void inviteFlowGivesAMemberReadOnlyAccess() throws Exception {
		Login owner = login(email());
		JsonNode created = json(mvc.perform(post("/api/workspace/invites").session(owner.session()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"member\"}"))
				.andExpect(status().isOk()).andReturn());
		String token = created.get("token").asText();
		assertThat(created.get("url").asText()).endsWith("/invite/" + token);

		// preview is public
		mvc.perform(get("/api/invites/" + token)).andExpect(status().isOk());

		Login joiner = login(email());
		mvc.perform(post("/api/invites/" + token + "/accept").session(joiner.session()).with(csrf()))
				.andExpect(status().isOk());

		String ws = owner.workspaceId();
		// reads are fine
		mvc.perform(get("/admin/budgets").session(joiner.session()).header("X-Workspace-ID", ws))
				.andExpect(status().isOk());
		mvc.perform(get("/api/workspace/members").session(joiner.session()).header("X-Workspace-ID", ws))
				.andExpect(status().isOk());
		// writes are not
		mvc.perform(put("/admin/budgets").session(joiner.session()).header("X-Workspace-ID", ws).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"scope\":\"team\",\"ref\":\"default\",\"limit\":1}"))
				.andExpect(status().isForbidden());

		// the link is single use
		Login late = login(email());
		mvc.perform(post("/api/invites/" + token + "/accept").session(late.session()).with(csrf()))
				.andExpect(status().isGone());
	}

	@Test
	void theLastOwnerCannotLeaveOrBeDemoted() throws Exception {
		Login owner = login(email());
		String me = owner.me().get("user").get("id").asText();
		mvc.perform(delete("/api/workspace/members/" + me).session(owner.session()).with(csrf()))
				.andExpect(status().isConflict());
		mvc.perform(patch("/api/workspace/members/" + me).session(owner.session()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"admin\"}"))
				.andExpect(status().isConflict());
	}

	@Test
	void revokedKeyStopsWorkingImmediately() throws Exception {
		Login owner = login(email());
		String teamId = json(mvc.perform(get("/api/workspace/teams").session(owner.session())).andReturn())
				.get(0).get("id").asText();
		JsonNode minted = json(mvc.perform(post("/admin/keys").session(owner.session()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"teamId\":\"" + teamId + "\",\"name\":\"ci\"}"))
				.andExpect(status().isOk()).andReturn());
		String rawKey = minted.get("key").asText();

		JsonNode listed = json(mvc.perform(get("/admin/keys").session(owner.session())).andReturn());
		assertThat(listed.toString()).contains("\"name\":\"ci\"").doesNotContain(rawKey);

		mvc.perform(get("/admin/audit").header("Authorization", "Bearer " + rawKey)).andExpect(status().isOk());
		mvc.perform(delete("/admin/keys/" + minted.get("id").asText()).session(owner.session()).with(csrf()))
				.andExpect(status().isNoContent());
		mvc.perform(get("/admin/audit").header("Authorization", "Bearer " + rawKey))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void adminActionsAreAttributedToThePerson() throws Exception {
		String email = email();
		Login owner = login(email);
		mvc.perform(put("/admin/budgets").session(owner.session()).with(csrf())
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"scope\":\"team\",\"ref\":\"default\",\"limit\":2}"))
				.andExpect(status().isOk());
		JsonNode activity = json(mvc.perform(get("/admin/activity").session(owner.session())).andReturn());
		assertThat(activity.get("content").get(0).get("actor").asText()).isEqualTo("user:" + email);
	}

	@Test
	void providersEndpointAdvertisesDevLogin() throws Exception {
		JsonNode providers = json(mvc.perform(get("/auth/providers")).andExpect(status().isOk()).andReturn());
		assertThat(providers.get("devLogin").asBoolean()).isTrue();
		assertThat(providers.get("github").asBoolean()).isFalse();
	}
}
