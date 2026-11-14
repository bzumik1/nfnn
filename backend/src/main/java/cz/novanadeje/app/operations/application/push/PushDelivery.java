package cz.novanadeje.app.operations.application.push;

import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushRecipient;
import cz.novanadeje.app.operations.domain.push.PushSubscriptionId;
import cz.novanadeje.app.operations.domain.push.VapidKeys;

import java.util.List;
import java.util.Map;

public interface PushDelivery {

    Map<PushSubscriptionId, PushOutcome> deliver(List<? extends PushRecipient> recipients, PushMessage message, VapidKeys keys, PushPace pace);
}
