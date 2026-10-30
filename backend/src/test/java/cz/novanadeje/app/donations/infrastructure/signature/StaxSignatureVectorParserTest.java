package cz.novanadeje.app.donations.infrastructure.signature;

import cz.novanadeje.app.donations.domain.receipt.SignaturePath;
import cz.novanadeje.app.donations.domain.receipt.SignatureVector;
import cz.novanadeje.app.donations.domain.receipt.SignatureVectorProblem;
import cz.novanadeje.app.donations.domain.receipt.UnsupportedSignatureVector;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;

class StaxSignatureVectorParserTest {

    static final String SYNTHETIC_SIGNATURE = """
            <?xml version="1.0" encoding="UTF-8"?>
            <!-- a synthetic signature drawn for the tests -->
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:x="urn:example:note" viewBox="0 0 300 100" width="300" height="100" version="1.1">
              <metadata><x:note>drawn by hand <x:by>for the tests</x:by></x:note></metadata>
              <title>Podpis</title>
              <desc>Synthetic</desc>
              <g fill="#1D2A5C" fill-opacity="0.9">
                <path d="M10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80 Z"/>
                <g fill-opacity=".5">
                  <path fill-opacity="0.133" d="M190,60 l20-30 h30 v20 q10 10 20 0 t20 0 a10 10 0 0 1 20 0 z"></path>
                  <path d="M200 90 L210 95"/>
                </g>
              </g>
              <path fill="#c0392b" opacity="0.5" fill-opacity="0.5" d="m 250 50 L 290 90 Z"/>
            </svg>
            """;

    private final StaxSignatureVectorParser parser = new StaxSignatureVectorParser();

    @Test
    @DisplayName("Given an SVG of filled paths in groups, when it is parsed, then the paths come out flat with the fill and opacity they inherit")
    void should_flatten_paths_with_inherited_fill_when_parsed_given_paths_in_groups() {
        SignatureVector vector = parser.parse(bytes(SYNTHETIC_SIGNATURE));

        assertThat(vector.viewBox().canonical()).isEqualTo("0 0 300 100");
        assertThat(vector.paths()).extracting(SignaturePath::fill, path -> path.opacity().toPlainString())
                .containsExactly(
                        tuple("#1d2a5c", "0.9"),
                        tuple("#1d2a5c", "0.133"),
                        tuple("#1d2a5c", "0.5"),
                        tuple("#c0392b", "0.25"));
        assertThat(vector.paths().getFirst().data().value()).isEqualTo("M10 80 C40 10 65 10 95 80 S150 150 180 80 Z");
    }

    @Test
    @DisplayName("Given one SVG, when it is parsed twice, then both give the same canonical JSON byte for byte and one digest")
    void should_give_same_canonical_json_when_parsed_twice_given_one_svg() {
        SignatureVector vector = parser.parse(bytes(SYNTHETIC_SIGNATURE));

        SignatureVector again = parser.parse(bytes(SYNTHETIC_SIGNATURE));

        assertThat(again).isEqualTo(vector);
        assertThat(again.canonicalBytes()).isEqualTo(vector.canonicalBytes());
        assertThat(again.digest()).isEqualTo(vector.digest());
    }

    @Test
    @DisplayName("Given a path without a fill anywhere, when it is parsed, then it is black and opaque as SVG draws it")
    void should_fill_black_when_parsed_given_no_fill() {
        SignatureVector vector = parser.parse(bytes("<svg viewBox=\"0 0 10 10\"><path d=\"M0 0 L10 10\"/></svg>"));

        assertThat(vector.paths().getFirst().fill()).isEqualTo("#000000");
        assertThat(vector.paths().getFirst().opacity().toPlainString()).isEqualTo("1");
    }

    @Test
    @DisplayName("Given an SVG with a byte order mark, when it is parsed, then it is read like one without")
    void should_read_when_parsed_given_byte_order_mark() {
        byte[] withBom = bytes("﻿<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><path d=\"M0 0 L10 10\"/></svg>");

        assertThat(parser.parse(withBom).paths()).hasSize(1);
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "script element|<svg viewBox='0 0 10 10'><script>alert(1)</script><path d='M0 0 L1 1'/></svg>|ELEMENT|script",
            "style element|<svg viewBox='0 0 10 10'><style>path{fill:red}</style><path d='M0 0 L1 1'/></svg>|ELEMENT|style",
            "image element|<svg viewBox='0 0 10 10'><image href='https://example.com/a.png'/></svg>|ELEMENT|image",
            "use element|<svg viewBox='0 0 10 10'><use href='#a'/></svg>|ELEMENT|use",
            "foreign object|<svg viewBox='0 0 10 10'><foreignObject><div xmlns='http://www.w3.org/1999/xhtml'>x</div></foreignObject></svg>|ELEMENT|foreignObject",
            "filter element|<svg viewBox='0 0 10 10'><defs><filter id='f'><feGaussianBlur stdDeviation='2'/></filter></defs></svg>|ELEMENT|defs",
            "bare filter element|<svg viewBox='0 0 10 10'><filter id='f'/><path d='M0 0 L1 1'/></svg>|ELEMENT|filter",
            "text element|<svg viewBox='0 0 10 10'><text>Josef</text></svg>|ELEMENT|text",
            "circle element|<svg viewBox='0 0 10 10'><circle r='5'/></svg>|ELEMENT|circle",
            "element of another namespace|<svg viewBox='0 0 10 10' xmlns:i='urn:x'><i:layer/></svg>|ELEMENT|i:layer",
            "child of a path|<svg viewBox='0 0 10 10'><path d='M0 0 L1 1'><animate attributeName='d'/></path></svg>|ELEMENT|animate",
            "root other than svg|<html><path d='M0 0 L1 1'/></html>|ELEMENT|html",
            "processing instruction|<?xml-stylesheet href='https://example.com/a.css'?><svg viewBox='0 0 10 10'><path d='M0 0 L1 1'/></svg>|ELEMENT|?xml-stylesheet",
            "href attribute|<svg viewBox='0 0 10 10'><path href='https://example.com' d='M0 0 L1 1'/></svg>|ATTRIBUTE|href",
            "xlink href attribute|<svg viewBox='0 0 10 10' xmlns:xlink='http://www.w3.org/1999/xlink'><path xlink:href='#a' d='M0 0 L1 1'/></svg>|ATTRIBUTE|xlink:href",
            "style attribute|<svg viewBox='0 0 10 10'><path style='fill:url(https://example.com/x)' d='M0 0 L1 1'/></svg>|ATTRIBUTE|style",
            "event attribute|<svg viewBox='0 0 10 10' onload='alert(1)'><path d='M0 0 L1 1'/></svg>|ATTRIBUTE|onload",
            "transform attribute|<svg viewBox='0 0 10 10'><g transform='scale(2)'><path d='M0 0 L1 1'/></g></svg>|ATTRIBUTE|transform",
            "filter attribute|<svg viewBox='0 0 10 10'><path filter='url(#f)' d='M0 0 L1 1'/></svg>|ATTRIBUTE|filter",
            "class attribute|<svg viewBox='0 0 10 10'><path class='a' d='M0 0 L1 1'/></svg>|ATTRIBUTE|class",
            "opacity on a group|<svg viewBox='0 0 10 10'><g opacity='0.5'><path d='M0 0 L1 1'/></g></svg>|ATTRIBUTE|opacity",
            "fill from a URL|<svg viewBox='0 0 10 10'><path fill='url(#gradient)' d='M0 0 L1 1'/></svg>|FILL|",
            "named colour|<svg viewBox='0 0 10 10'><g fill='red'><path d='M0 0 L1 1'/></g></svg>|FILL|",
            "opacity above one|<svg viewBox='0 0 10 10'><path fill-opacity='2' d='M0 0 L1 1'/></svg>|OPACITY|",
            "text in a group|<svg viewBox='0 0 10 10'><g>Josef<path d='M0 0 L1 1'/></g></svg>|TEXT|",
            "character data|<svg viewBox='0 0 10 10'><![CDATA[<script>alert(1)</script>]]><path d='M0 0 L1 1'/></svg>|TEXT|",
            "missing view box|<svg width='10' height='10'><path d='M0 0 L1 1'/></svg>|VIEW_BOX|",
            "broken view box|<svg viewBox='0 0 10'><path d='M0 0 L1 1'/></svg>|VIEW_BOX|",
            "path without data|<svg viewBox='0 0 10 10'><path fill='#000'/></svg>|PATH_DATA|",
            "malformed path data|<svg viewBox='0 0 10 10'><path d='M0 0 L1'/></svg>|PATH_DATA|",
            "no paths|<svg viewBox='0 0 10 10'><g fill='#000'/></svg>|NO_PATHS|",
            "unclosed element|<svg viewBox='0 0 10 10'><path d='M0 0 L1 1'>|MALFORMED|",
            "not XML|<<<|MALFORMED|",
            "two roots|<svg viewBox='0 0 10 10'><path d='M0 0 L1 1'/></svg><svg viewBox='0 0 10 10'/>|MALFORMED|",
            "undeclared entity|<svg viewBox='0 0 10 10'><path d='M0 0 L1 1'/>&ext;</svg>|MALFORMED|"
    })
    @DisplayName("Given an SVG with something outside the allow-list, when it is parsed, then it is refused naming the problem")
    void should_refuse_when_parsed_given_construct_outside_allow_list(String name, String svg, SignatureVectorProblem problem, String refusedName) {
        assertThatThrownBy(() -> parser.parse(bytes(svg)))
                .isInstanceOfSatisfying(UnsupportedSignatureVector.class, refused -> {
                    assertThat(refused.problem()).isEqualTo(problem);
                    if (refusedName != null) {
                        assertThat(refused.name()).contains(refusedName);
                    }
                });
    }

    @Test
    @DisplayName("Given a document type that declares an external entity, when it is parsed, then it is refused before the entity is read")
    void should_refuse_without_reading_when_parsed_given_external_entity(@TempDir Path folder) throws IOException {
        Path secret = Files.writeString(folder.resolve("secret.txt"), "M0 0 L9 9");
        String svg = "<?xml version=\"1.0\"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM \"" + secret.toUri() + "\">]>"
                + "<svg viewBox=\"0 0 10 10\"><path d=\"&xxe;\"/></svg>";

        assertRefusedAs(svg, SignatureVectorProblem.DOCTYPE);
    }

    @Test
    @DisplayName("Given a document type that points to a DTD on the network, when it is parsed, then it is refused and nothing is fetched")
    void should_refuse_without_fetching_when_parsed_given_external_dtd() throws IOException {
        AtomicInteger requests = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/", exchange -> {
            requests.incrementAndGet();
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        try {
            String dtd = "http://127.0.0.1:" + server.getAddress().getPort() + "/svg.dtd";
            String svg = "<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\" \"" + dtd + "\">"
                    + "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0 L1 1\"/></svg>";

            assertRefusedAs(svg, SignatureVectorProblem.DOCTYPE);
            String parameterEntity = "<!DOCTYPE svg [<!ENTITY % remote SYSTEM \"" + dtd + "\"> %remote;]>"
                    + "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0 L1 1\"/></svg>";
            assertRefusedAs(parameterEntity, SignatureVectorProblem.DOCTYPE);
        } finally {
            server.stop(0);
        }
        assertThat(requests).hasValue(0);
    }

    @Test
    @DisplayName("Given a document type with nested internal entities, when it is parsed, then it is refused without expanding them")
    void should_refuse_without_expanding_when_parsed_given_entity_expansion() {
        String svg = "<!DOCTYPE svg [<!ENTITY a \"M0 0 L1 1 \"><!ENTITY b \"&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;\">"
                + "<!ENTITY c \"&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;\"><!ENTITY d \"&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;\">]>"
                + "<svg viewBox=\"0 0 10 10\"><path d=\"&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;\"/></svg>";

        assertRefusedAs(svg, SignatureVectorProblem.DOCTYPE);
    }

    @Test
    @DisplayName("Given groups nested deeper than a signature needs, when it is parsed, then it is refused as too complex")
    void should_refuse_when_parsed_given_deep_nesting() {
        String svg = "<svg viewBox=\"0 0 10 10\">" + "<g>".repeat(StaxSignatureVectorParser.MAX_DEPTH) + "<path d=\"M0 0 L1 1\"/>"
                + "</g>".repeat(StaxSignatureVectorParser.MAX_DEPTH) + "</svg>";

        assertRefusedAs(svg, SignatureVectorProblem.TOO_COMPLEX);
    }

    @Test
    @DisplayName("Given an SVG in another encoding than UTF-8, when it is parsed, then it is refused as malformed")
    void should_refuse_when_parsed_given_other_encoding() {
        byte[] utf16 = "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0 L1 1\"/></svg>".getBytes(StandardCharsets.UTF_16);

        assertThatThrownBy(() -> parser.parse(utf16))
                .isInstanceOfSatisfying(UnsupportedSignatureVector.class,
                        refused -> assertThat(refused.problem()).isEqualTo(SignatureVectorProblem.MALFORMED));
    }

    private void assertRefusedAs(String svg, SignatureVectorProblem problem) {
        assertThatThrownBy(() -> parser.parse(bytes(svg)))
                .isInstanceOfSatisfying(UnsupportedSignatureVector.class, refused -> assertThat(refused.problem()).isEqualTo(problem));
    }

    private static byte[] bytes(String svg) {
        return svg.getBytes(StandardCharsets.UTF_8);
    }
}
