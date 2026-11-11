package cz.novanadeje.app.donations.infrastructure.banklogo;

import java.net.InetAddress;
import java.net.UnknownHostException;

@FunctionalInterface
interface HostResolver {

    InetAddress[] resolve(String host) throws UnknownHostException;
}
