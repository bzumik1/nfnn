package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Component
class PushPayloads {

    static final Locale CZECH = Locale.forLanguageTag("cs");
    static final String ICON = "/icon-192.png";
    static final String CLICK_OPERATION = "focusLastFocusedOrOpen";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final MessageSource messages;

    PushPayloads(MessageSource messages) {
        this.messages = messages;
    }

    byte[] of(PushMessage message) {
        PushMessageKind kind = message.kind();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("kind", kind.token());
        if (kind.carriesOpenAlertCount()) {
            data.put("count", message.count());
        }
        Map<String, Object> click = new LinkedHashMap<>();
        click.put("operation", CLICK_OPERATION);
        click.put("url", routeOf(kind));
        data.put("onActionClick", Map.of("default", click));
        Map<String, Object> notification = new LinkedHashMap<>();
        notification.put("title", text(kind, "title"));
        notification.put("body", text(kind, "body"));
        notification.put("tag", tagOf(kind));
        notification.put("renotify", true);
        notification.put("lang", CZECH.toLanguageTag());
        notification.put("icon", ICON);
        notification.put("data", data);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("v", PushMessage.VERSION);
        payload.put("kind", kind.token());
        if (kind.carriesOpenAlertCount()) {
            payload.put("count", message.count());
        }
        payload.put("notification", notification);
        byte[] written = JSON.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8);
        if (written.length >= WebPushDelivery.PADDED_MESSAGE_BYTES) {
            throw new IllegalStateException("The push message of kind " + kind.token() + " does not fit the padded length");
        }
        return written;
    }

    static String routeOf(PushMessageKind kind) {
        return switch (kind) {
            case TEST -> "/sprava/upozorneni";
            case BANK_IMPORT_OUTAGE, BANK_IMPORT_RECOVERED -> "/sprava";
            case BACKUPS_OUTAGE, BACKUPS_RECOVERED -> "/sprava/zalohy";
            case MAIL_OUTAGE, MAIL_RECOVERED -> "/sprava/nastaveni";
            case DONOR_TEST -> "/darce/udaje";
            case GIFT_ARRIVED -> "/darce/dary";
            case YEARLY_RECEIPT_READY -> "/darce/potvrzeni";
        };
    }

    private static String tagOf(PushMessageKind kind) {
        return switch (kind) {
            case TEST -> "nfnn-test";
            case BANK_IMPORT_OUTAGE, BANK_IMPORT_RECOVERED -> "nfnn-bank-import";
            case BACKUPS_OUTAGE, BACKUPS_RECOVERED -> "nfnn-backups";
            case MAIL_OUTAGE, MAIL_RECOVERED -> "nfnn-mail";
            case DONOR_TEST -> "nfnn-donor-test";
            case GIFT_ARRIVED -> "nfnn-gifts";
            case YEARLY_RECEIPT_READY -> "nfnn-receipts";
        };
    }

    private String text(PushMessageKind kind, String part) {
        return messages.getMessage("push.notification." + kind.token() + "." + part, null, CZECH);
    }
}
