package cz.novanadeje.app.donations.domain.banklogo;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;

import java.util.Map;
import java.util.Set;

final class BankLogoHosts {

    private static final Set<String> APP_STORE_ARTWORK = Set.of(
            "is1-ssl.mzstatic.com", "is2-ssl.mzstatic.com", "is3-ssl.mzstatic.com", "is4-ssl.mzstatic.com", "is5-ssl.mzstatic.com");
    private static final Map<String, Set<String>> OWN_SITES = Map.of(
            "0800", Set.of("www.csas.cz", "cdn.erstegroup.com"),
            "0300", Set.of("www.csob.cz"),
            "0100", Set.of("www.kb.cz"),
            "0600", Set.of("www.moneta.cz"),
            "2010", Set.of("www.fio.cz"),
            "3030", Set.of("www.airbank.cz"),
            "5500", Set.of("www.rb.cz"),
            "2700", Set.of("www.unicreditbank.cz"),
            "6210", Set.of("www.mbank.cz"));

    private BankLogoHosts() {
    }

    static boolean admit(String host, BankCode bank) {
        return APP_STORE_ARTWORK.contains(host) || OWN_SITES.getOrDefault(bank.value(), Set.of()).contains(host);
    }
}
