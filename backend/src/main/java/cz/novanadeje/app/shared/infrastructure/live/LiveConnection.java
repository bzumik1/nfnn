package cz.novanadeje.app.shared.infrastructure.live;

import java.io.IOException;
import java.util.Map;

public interface LiveConnection {

    void send(String event, Map<String, String> data) throws IOException;

    void heartbeat() throws IOException;

    void close();

    void onEnd(Runnable callback);
}
