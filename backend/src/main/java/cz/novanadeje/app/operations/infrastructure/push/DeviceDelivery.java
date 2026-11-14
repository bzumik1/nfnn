package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushOutcome;
import cz.novanadeje.app.operations.domain.push.PushRecipient;
import cz.novanadeje.app.operations.domain.push.VapidKeys;

interface DeviceDelivery {

    PushOutcome deliver(PushRecipient recipient, PushMessage message, VapidKeys keys);
}
