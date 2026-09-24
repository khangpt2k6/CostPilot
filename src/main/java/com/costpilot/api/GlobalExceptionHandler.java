package com.costpilot.api;

import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.costpilot.api.dto.ErrorResponse;
import com.costpilot.budget.BudgetExceededException;
import com.costpilot.policy.PolicyDeniedException;
import com.costpilot.security.InvalidApiKeyException;

@RestControllerAdvice
public class GlobalExceptionHandler {

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
		String message = ex.getBindingResult().getFieldErrors().stream()
				.map(error -> error.getField() + ": " + error.getDefaultMessage())
				.sorted()
				.collect(Collectors.joining("; "));
		return badRequest(message.isEmpty() ? "invalid request body" : message);
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ResponseEntity<ErrorResponse> handleUnreadable(HttpMessageNotReadableException ex) {
		return badRequest("malformed request body: expected valid JSON matching the chat completions schema");
	}

	@ExceptionHandler(InvalidApiKeyException.class)
	ResponseEntity<ErrorResponse> handleInvalidApiKey(InvalidApiKeyException ex) {
		// 401: missing/unknown/revoked key that slipped past the filter into a controller
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
				.body(new ErrorResponse(new ErrorResponse.ErrorBody(
						ex.getMessage(), "unauthorized", null)));
	}

	@ExceptionHandler(BudgetExceededException.class)
	ResponseEntity<ErrorResponse> handleBudgetExceeded(BudgetExceededException ex) {
		// 402: the org's budget says no - machine-readable type + scope code
		return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
				.body(ErrorResponse.budgetExceeded(ex.getMessage(), ex.getScope().dbValue()));
	}

	@ExceptionHandler(PolicyDeniedException.class)
	ResponseEntity<ErrorResponse> handlePolicyDenied(PolicyDeniedException ex) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN)
				.body(new ErrorResponse(new ErrorResponse.ErrorBody(
						ex.getMessage(), "policy_denied", String.valueOf(ex.getDecision().matchedRuleId()))));
	}

	// 4.1: admin inputs that fail domain validation (unknown scope, a tenant budget aimed
	// at another tenant) are the caller's mistake, not a server error
	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ErrorResponse> handleIllegalArgument(IllegalArgumentException ex) {
		return badRequest(ex.getMessage());
	}

	// 4.2 console errors
	@ExceptionHandler(java.util.NoSuchElementException.class)
	ResponseEntity<ErrorResponse> handleNotFound(java.util.NoSuchElementException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND)
				.body(new ErrorResponse(new ErrorResponse.ErrorBody(ex.getMessage(), "not_found", null)));
	}

	@ExceptionHandler(com.costpilot.account.WorkspaceRuleException.class)
	ResponseEntity<ErrorResponse> handleWorkspaceRule(com.costpilot.account.WorkspaceRuleException ex) {
		return ResponseEntity.status(HttpStatus.CONFLICT)
				.body(new ErrorResponse(new ErrorResponse.ErrorBody(ex.getMessage(), "workspace_rule", null)));
	}

	@ExceptionHandler(com.costpilot.account.InviteUnavailableException.class)
	ResponseEntity<ErrorResponse> handleInviteGone(com.costpilot.account.InviteUnavailableException ex) {
		return ResponseEntity.status(HttpStatus.GONE)
				.body(new ErrorResponse(new ErrorResponse.ErrorBody(ex.getMessage(), "invite_unavailable", null)));
	}

	@ExceptionHandler(com.costpilot.account.CurrentUser.NotAUserException.class)
	ResponseEntity<ErrorResponse> handleNotAUser(com.costpilot.account.CurrentUser.NotAUserException ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
				.body(new ErrorResponse(new ErrorResponse.ErrorBody(ex.getMessage(), "login_required", null)));
	}

	private ResponseEntity<ErrorResponse> badRequest(String message) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ErrorResponse.invalidRequest(message));
	}
}
