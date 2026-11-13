package cz.novanadeje.app.donors.infrastructure.oauth;

import java.net.InetAddress;
import java.net.UnknownHostException;

@FunctionalInterface
interface HostResolver {

    InetAddress[] resolve(String host) throws UnknownHostException, InterruptedException;
}
