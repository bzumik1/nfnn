package cz.novanadeje.app.donations.infrastructure.cnb;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.util.StringUtils;

class BankCodeScheduleCondition implements Condition {

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        String cron = context.getEnvironment().getProperty("app.donations.bank-codes.cron");
        return StringUtils.hasText(cron) && !Scheduled.CRON_DISABLED.equals(cron.trim());
    }
}
