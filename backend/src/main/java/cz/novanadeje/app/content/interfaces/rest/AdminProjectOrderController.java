package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.project.ProjectOrderService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/content/project-order")
class AdminProjectOrderController {

    private final ProjectOrderService orders;

    AdminProjectOrderController(ProjectOrderService orders) {
        this.orders = orders;
    }

    @GetMapping
    ProjectOrderResponse read() {
        return ProjectOrderResponse.from(orders.current());
    }

    @PutMapping
    ProjectOrderResponse change(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProjectOrderRequest request) {
        return ProjectOrderResponse.from(orders.change(UUID.fromString(jwt.getSubject()), request.toOrder()));
    }
}
