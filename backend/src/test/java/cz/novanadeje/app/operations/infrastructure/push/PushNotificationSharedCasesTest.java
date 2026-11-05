package cz.novanadeje.app.operations.infrastructure.push;

import cz.novanadeje.app.operations.domain.push.PushMessage;
import cz.novanadeje.app.operations.domain.push.PushMessageKind;
import cz.novanadeje.app.sharedcases.SharedCase;
import cz.novanadeje.app.sharedcases.SharedCaseRunner;
import org.springframework.context.support.ResourceBundleMessageSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.JsonNodeFactory;

import java.util.Arrays;

class PushNotificationSharedCasesTest extends SharedCaseRunner {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Override
    protected String caseFile() {
        return "push/notification.json";
    }

    @Override
    protected String when() {
        return "when the backend writes the notification of the alert's kind";
    }

    @Override
    protected String then() {
        return "then it carries the expected tag and the route a click opens";
    }

    @Override
    protected void run(SharedCase sharedCase) {
        String token = sharedCase.input().get("kind").asString();
        PushMessageKind kind = Arrays.stream(PushMessageKind.values()).filter(candidate -> candidate.token().equals(token)).findFirst().orElseThrow();
        JsonNode notification = JSON.readTree(new PushPayloads(messages()).of(new PushMessage(kind, 0))).get("notification");

        assertGives(JsonNodeFactory.instance.objectNode()
                .put("tag", notification.get("tag").asString())
                .put("url", notification.get("data").get("onActionClick").get("default").get("url").asString()), sharedCase.expected());
    }

    private static ResourceBundleMessageSource messages() {
        ResourceBundleMessageSource messages = new ResourceBundleMessageSource();
        messages.setBasename("i18n/messages");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
        return messages;
    }
}
