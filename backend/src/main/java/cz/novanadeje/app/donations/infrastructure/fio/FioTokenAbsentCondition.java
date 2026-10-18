package cz.novanadeje.app.donations.infrastructure.fio;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

class FioTokenAbsentCondition implements Condition {

    private final FioTokenPresentCondition present = new FioTokenPresentCondition();

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        return !present.matches(context, metadata);
    }
}
