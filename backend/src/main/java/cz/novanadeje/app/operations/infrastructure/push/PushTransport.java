package cz.novanadeje.app.operations.infrastructure.push;

import java.net.URI;
import java.util.Map;

public interface PushTransport {

    int post(URI endpoint, Map<String, String> headers, byte[] body);
}
