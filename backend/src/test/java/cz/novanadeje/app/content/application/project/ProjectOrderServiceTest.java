package cz.novanadeje.app.content.application.project;

import cz.novanadeje.app.content.domain.project.ProjectOrder;
import cz.novanadeje.app.content.domain.project.ProjectOrderRepository;
import cz.novanadeje.app.shared.application.event.AdminActionPerformed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProjectOrderServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-30T22:00:00Z");
    private static final UUID ADMIN = UUID.fromString("019a1c00-0000-7000-8000-00000000a001");

    @Mock
    private ProjectOrderRepository orders;
    @Mock
    private ApplicationEventPublisher events;

    private ProjectOrderService service() {
        return new ProjectOrderService(orders, events, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    @DisplayName("Given the default order, when an administrator chooses the year alone, then it is saved and audited with both orders")
    void should_save_and_audit_when_changed_given_another_order() {
        when(orders.current()).thenReturn(ProjectOrder.YEAR_THEN_CATEGORY);

        ProjectOrder chosen = service().change(ADMIN, ProjectOrder.YEAR);

        assertThat(chosen).isEqualTo(ProjectOrder.YEAR);
        verify(orders).save(ProjectOrder.YEAR, NOW);
        ArgumentCaptor<AdminActionPerformed> event = ArgumentCaptor.forClass(AdminActionPerformed.class);
        verify(events).publishEvent(event.capture());
        assertThat(event.getValue()).isEqualTo(new AdminActionPerformed(ADMIN, "CHANGE_PROJECT_ORDER", Optional.empty(),
                "Řazení projektů na webu změněno z YEAR_THEN_CATEGORY na YEAR", NOW));
    }

    @Test
    @DisplayName("Given the year alone chosen, when an administrator chooses it again, then nothing is saved or audited")
    void should_change_nothing_when_changed_given_the_same_order() {
        when(orders.current()).thenReturn(ProjectOrder.YEAR);

        ProjectOrder chosen = service().change(ADMIN, ProjectOrder.YEAR);

        assertThat(chosen).isEqualTo(ProjectOrder.YEAR);
        verify(orders, never()).save(any(), any());
        verify(events, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("Given an order chosen, when the order is read, then it is the one chosen")
    void should_read_the_chosen_order_when_read() {
        when(orders.current()).thenReturn(ProjectOrder.CATEGORY_THEN_YEAR);

        assertThat(service().current()).isEqualTo(ProjectOrder.CATEGORY_THEN_YEAR);
    }
}
