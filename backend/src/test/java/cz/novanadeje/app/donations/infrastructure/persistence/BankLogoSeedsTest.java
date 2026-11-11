package cz.novanadeje.app.donations.infrastructure.persistence;

import cz.novanadeje.app.donations.domain.bankcode.BankCode;
import cz.novanadeje.app.donations.domain.banklogo.BankLogoSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;

class BankLogoSeedsTest {

    private static final String CHANGELOG = "db/changelog/donations/031_show_bank_logos.xml";

    @Test
    @DisplayName("Given the changelog that brings bank logos, when its seeded sources are read, then the nine banks Jakub chose each get an App Store address the domain accepts")
    void should_seed_nine_allowed_sources_when_read_given_changelog() throws Exception {
        Map<String, String> seeds = seeds();

        assertThat(seeds).containsOnlyKeys("0800", "0300", "0100", "0600", "2010", "3030", "5500", "2700", "6210");
        seeds.forEach((code, url) -> {
            assertThatNoException().as(code).isThrownBy(() -> new BankLogoSource(new BankCode(code), url));
            assertThat(url).as(code).startsWith("https://is1-ssl.mzstatic.com/image/thumb/").endsWith("/512x512bb.jpg");
        });
    }

    private static Map<String, String> seeds() throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setNamespaceAware(true);
        Map<String, String> seeds = new LinkedHashMap<>();
        try (InputStream changelog = BankLogoSeedsTest.class.getClassLoader().getResourceAsStream(CHANGELOG)) {
            NodeList inserts = factory.newDocumentBuilder().parse(changelog).getElementsByTagNameNS("*", "insert");
            for (int index = 0; index < inserts.getLength(); index++) {
                Element insert = (Element) inserts.item(index);
                assertThat(insert.getAttribute("tableName")).isEqualTo("bank_logo");
                NodeList columns = insert.getElementsByTagNameNS("*", "column");
                Map<String, String> values = new LinkedHashMap<>();
                for (int column = 0; column < columns.getLength(); column++) {
                    Element value = (Element) columns.item(column);
                    values.put(value.getAttribute("name"), value.getAttribute("value"));
                }
                assertThat(values).containsOnlyKeys("code", "source_url");
                seeds.put(values.get("code"), values.get("source_url"));
            }
        }
        return seeds;
    }
}
