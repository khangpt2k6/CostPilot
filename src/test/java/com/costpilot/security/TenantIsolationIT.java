package com.costpilot.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.costpilot.TestcontainersConfiguration;
import com.costpilot.tenancy.Team;
import com.costpilot.tenancy.TeamRepository;
import com.costpilot.tenancy.Tenant;
import com.costpilot.tenancy.TenantRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

// 4.1 acceptance: two tenants on one instance, each with a team of the SAME name, can never
// read or affect each other's budgets, policies, approvals, audit trail or keys.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class TenantIsolationIT {

	private static final String ACME = AuthTestSupport.TENANT;

	@Autowired
	private TestRestTemplate rest;

	@Autowired
	private TenantRepository tenants;

	@Autowired
	private TeamRepository teams;

	@Autowired
	private ApiKeyRepository apiKeys;

	@Autowired
	private ApiKeyHasher hasher;

	private final ObjectMapper mapper = new ObjectMapper();

	private String shared;
	private String globexName;
	private String globexKey;
	private UUID acmeTeamId;

	@BeforeEach
	void twoTenantsWithTheSameTeamName() {
		shared = "shared-" + UUID.randomUUID();
		Tenant acme = tenants.findAll().stream().filter(t -> t.getName().equals(ACME)).findFirst().orElseThrow();
		acmeTeamId = teams.save(new Team(acme.getId(), shared)).getId();

		globexName = "globex-" + UUID.randomUUID();
		Tenant globex = tenants.save(new Tenant(globexName));
		Team globexTeam = teams.save(new Team(globex.getId(), shared));
		globexKey = "cp_test_" + UUID.randomUUID();
		apiKeys.save(new ApiKey(globexTeam.getId(), null, hasher.hash(globexKey), "globex-admin", true));
	}

	@Test
	void sameNamedTeamsHoldIndependentBudgets() {
		// acme caps its team to effectively nothing
		assertThat(put("/admin/budgets", AuthTestSupport.ADMIN_KEY,
				"{\"scope\":\"team\",\"ref\":\"" + shared + "\",\"limit\":0.000000001}").getStatusCode())
				.isEqualTo(HttpStatus.OK);

		assertThat(chat(AuthTestSupport.ADMIN_KEY, "gpt-4o-mini").getStatusCode())
				.isEqualTo(HttpStatus.PAYMENT_REQUIRED);
		// the identically named team in globex is untouched by acme's cap
		assertThat(chat(globexKey, "gpt-4o-mini").getStatusCode()).isEqualTo(HttpStatus.OK);

		// and globex cannot even see acme's budget
		assertThat(get("/admin/budgets", globexKey).getBody()).doesNotContain(shared);
		assertThat(get("/admin/budgets", AuthTestSupport.ADMIN_KEY).getBody()).contains(shared);
	}

	@Test
	void policyRulesDoNotCrossTenants() {
		put("/admin/policies", AuthTestSupport.ADMIN_KEY, "{\"scopeType\":\"team\",\"scopeRef\":\"" + shared
				+ "\",\"allowedModels\":\"gemini-*\",\"fallbackAction\":\"deny\"}");

		assertThat(chat(AuthTestSupport.ADMIN_KEY, "gpt-4o-mini").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
		assertThat(chat(globexKey, "gpt-4o-mini").getStatusCode()).isEqualTo(HttpStatus.OK);
		assertThat(get("/admin/policies", globexKey).getBody()).doesNotContain(shared);
	}

	@Test
	void anotherTenantsApprovalIsInvisibleAndCannotBeDecided() throws Exception {
		put("/admin/policies", AuthTestSupport.ADMIN_KEY, "{\"scopeType\":\"team\",\"scopeRef\":\"" + shared
				+ "\",\"allowedModels\":\"gpt-4o-mini\",\"fallbackAction\":\"require_approval\"}");
		ResponseEntity<String> parked = chat(AuthTestSupport.ADMIN_KEY, "gpt-4o");
		assertThat(parked.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
		String id = mapper.readTree(parked.getBody()).get("id").asText();

		assertThat(get("/admin/approvals", globexKey).getBody()).doesNotContain(id);
		assertThat(get("/admin/approvals/" + id, globexKey).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(post("/admin/approvals/" + id + "/approve", globexKey, "").getStatusCode())
				.isEqualTo(HttpStatus.NOT_FOUND);
		assertThat(post("/admin/approvals/" + id + "/reject", globexKey, "{}").getStatusCode())
				.isEqualTo(HttpStatus.NOT_FOUND);
		// the owner still sees it pending
		assertThat(get("/admin/approvals", AuthTestSupport.ADMIN_KEY).getBody()).contains(id);
	}

	@Test
	void auditTrailIsConfinedToTheCallersTenant() throws Exception {
		chat(AuthTestSupport.ADMIN_KEY, "gpt-4o-mini");
		chat(globexKey, "gpt-4o-mini");

		JsonNode globexRows = mapper.readTree(get("/admin/audit?teamId=" + shared, globexKey).getBody())
				.get("content");
		assertThat(globexRows).isNotEmpty();
		globexRows.forEach(row -> assertThat(row.get("tenantId").asText()).isEqualTo(globexName));

		JsonNode acmeRows = mapper.readTree(get("/admin/audit?teamId=" + shared, AuthTestSupport.ADMIN_KEY)
				.getBody()).get("content");
		assertThat(acmeRows).isNotEmpty();
		acmeRows.forEach(row -> assertThat(row.get("tenantId").asText()).isEqualTo(ACME));

		String acmeRowId = acmeRows.get(0).get("id").asText();
		assertThat(get("/admin/audit/" + acmeRowId, globexKey).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
	}

	@Test
	void cannotMintAKeyForAnotherTenantsTeam() {
		ResponseEntity<String> minted = post("/admin/keys", globexKey,
				"{\"teamId\":\"" + acmeTeamId + "\",\"name\":\"stolen\",\"admin\":true}");
		assertThat(minted.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
	}

	@Test
	void tenantBudgetCannotTargetAnotherTenant() {
		ResponseEntity<String> r = put("/admin/budgets", globexKey,
				"{\"scope\":\"tenant\",\"ref\":\"" + ACME + "\",\"limit\":1}");
		assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
	}

	// both callers are tenant admins; the X-Team-ID header pins the shared team name
	private ResponseEntity<String> chat(String key, String model) {
		HttpHeaders h = headers(key);
		h.set("X-Team-ID", shared);
		String body = "{\"model\":\"" + model
				+ "\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":false,\"max_tokens\":16}";
		return rest.exchange("/v1/chat/completions", HttpMethod.POST, new HttpEntity<>(body, h), String.class);
	}

	private ResponseEntity<String> get(String path, String key) {
		return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(headers(key)), String.class);
	}

	private ResponseEntity<String> put(String path, String key, String body) {
		return rest.exchange(path, HttpMethod.PUT, new HttpEntity<>(body, headers(key)), String.class);
	}

	private ResponseEntity<String> post(String path, String key, String body) {
		return rest.exchange(path, HttpMethod.POST, new HttpEntity<>(body, headers(key)), String.class);
	}

	private static HttpHeaders headers(String key) {
		HttpHeaders h = new HttpHeaders();
		h.setBearerAuth(key);
		h.setContentType(MediaType.APPLICATION_JSON);
		return h;
	}
}
