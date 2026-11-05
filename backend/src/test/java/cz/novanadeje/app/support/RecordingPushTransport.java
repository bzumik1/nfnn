package cz.novanadeje.app.support;

import cz.novanadeje.app.operations.infrastructure.push.PushTransport;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class RecordingPushTransport implements PushTransport {

    public static final int CREATED = 201;

    public record Sent(URI endpoint, Map<String, String> headers, byte[] body) {
    }

    private final List<Sent> sent = new ArrayList<>();
    private final Map<URI, Integer> answers = new HashMap<>();

    @Override
    public synchronized int post(URI endpoint, Map<String, String> headers, byte[] body) {
        sent.add(new Sent(endpoint, Map.copyOf(headers), body.clone()));
        return answers.getOrDefault(endpoint, CREATED);
    }

    public synchronized void answer(URI endpoint, int status) {
        answers.put(endpoint, status);
    }

    public synchronized List<Sent> sent() {
        return List.copyOf(sent);
    }

    public synchronized void reset() {
        sent.clear();
        answers.clear();
    }
}
