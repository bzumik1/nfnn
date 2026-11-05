package cz.novanadeje.app.shared.infrastructure.live;

public sealed interface LiveOpening<C extends LiveConnection> {

    record Opened<C extends LiveConnection>(C connection) implements LiveOpening<C> {
    }

    record SessionEnded<C extends LiveConnection>() implements LiveOpening<C> {
    }

    record Full<C extends LiveConnection>() implements LiveOpening<C> {
    }
}
