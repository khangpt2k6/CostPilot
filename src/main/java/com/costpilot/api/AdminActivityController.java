package com.costpilot.api;

import java.time.Instant;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.costpilot.admin.AdminAudit;
import com.costpilot.admin.AdminAuditRepository;
import com.costpilot.security.CurrentPrincipal;

// 4.2: "who changed what" for the caller's workspace - budget/policy edits, approval
// decisions, key and member changes - newest first.
@RestController
@RequestMapping("/admin/activity")
public class AdminActivityController {

	private static final int MAX_PAGE_SIZE = 200;

	public record ActivityView(UUID id, String actor, String action, String targetType, String targetRef,
			String oldValue, String newValue, Instant createdAt) {

		static ActivityView of(AdminAudit a) {
			return new ActivityView(a.getId(), a.getActor(), a.getAction(), a.getTargetType(), a.getTargetRef(),
					a.getOldValue(), a.getNewValue(), a.getCreatedAt());
		}
	}

	private final AdminAuditRepository repository;

	public AdminActivityController(AdminAuditRepository repository) {
		this.repository = repository;
	}

	@GetMapping
	public Page<ActivityView> list(@RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "50") int size) {
		PageRequest request = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), MAX_PAGE_SIZE),
				Sort.by(Sort.Direction.DESC, "createdAt"));
		return repository.findByTenantId(CurrentPrincipal.require().tenantId(), request).map(ActivityView::of);
	}
}
