package cz.novanadeje.app.donors.infrastructure.ares;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import cz.novanadeje.app.donors.application.CompanyRegistryUnavailable;
import cz.novanadeje.app.donors.domain.CompanyIdentifier;
import cz.novanadeje.app.donors.domain.RegisteredCompany;
import cz.novanadeje.app.shared.domain.PostalAddress;
import cz.novanadeje.app.support.MutableClock;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AresCompanyRegistryTest {

    private static final CompanyIdentifier MINISTRY = new CompanyIdentifier("00006947");
    private static final CompanyIdentifier UNKNOWN = new CompanyIdentifier("10000011");
    private static final String MINISTRY_JSON = """
            {"ico":"00006947","obchodniJmeno":"Ministerstvo financí","sidlo":{"kodStatu":"CZ","nazevStatu":"Česká republika",
            "nazevObce":"Praha","nazevMestskehoObvodu":"Praha 1","nazevUlice":"Letenská","cisloDomovni":525,"cisloOrientacni":15,
            "nazevCastiObce":"Malá Strana","psc":11800,"textovaAdresa":"Letenská 525/15, Malá Strana, 11800 Praha 1",
            "standardizaceAdresy":true,"typCisloDomovni":1},"pravniForma":"325","dic":"CZ00006947"}""";

    private static final Duration FUNCTIONAL_TIMEOUT = Duration.ofSeconds(30);
    private static final Duration STALL_TIMEOUT = Duration.ofSeconds(2);

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-24T10:00:00Z"), ZoneOffset.UTC);
    private final Map<String, Answer> answers = new ConcurrentHashMap<>();
    private final AtomicInteger requests = new AtomicInteger();
    private HttpServer server;
    private AresCompanyRegistry registry;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ekonomicke-subjekty/", exchange -> {
            requests.incrementAndGet();
            String ico = exchange.getRequestURI().getPath().substring("/ekonomicke-subjekty/".length());
            answers.getOrDefault(ico, Answer.json(404, "{\"kod\":\"NENALEZENO\"}")).send(exchange);
        });
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        registry = localRegistry(FUNCTIONAL_TIMEOUT);
        answers.put(MINISTRY.value(), Answer.json(200, MINISTRY_JSON));
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    @DisplayName("Given the register knows the company, when it is found, then the name and the seat come back in the form of a donor's address")
    void should_map_name_and_seat_when_found_given_known_company() {
        assertThat(registry.find(MINISTRY)).contains(
                new RegisteredCompany(MINISTRY, "Ministerstvo financí", Optional.of(new PostalAddress("Letenská 525/15", "Praha 1", "118 00"))));
    }

    @Test
    @DisplayName("Given a seat outside Prague, when it is found, then the city is the municipality")
    void should_use_municipality_when_found_given_seat_outside_prague() {
        CompanyIdentifier brno = new CompanyIdentifier("44992785");
        answers.put(brno.value(), Answer.json(200, """
                {"ico":"44992785","obchodniJmeno":"Statutární město Brno","sidlo":{"kodStatu":"CZ","nazevObce":"Brno",
                "nazevMestskeCastiObvodu":"Brno-střed","nazevUlice":"Dominikánské náměstí","cisloDomovni":196,"cisloOrientacni":1,
                "nazevCastiObce":"Brno-město","psc":60200,"typCisloDomovni":1}}"""));

        assertThat(registry.find(brno)).flatMap(RegisteredCompany::seat)
                .contains(new PostalAddress("Dominikánské náměstí 196/1", "Brno", "602 00"));
    }

    @Test
    @DisplayName("Given a seat in a village without streets, when it is found, then the street line is the part of the village and its number")
    void should_use_village_part_when_found_given_no_street() {
        CompanyIdentifier village = new CompanyIdentifier("10000020");
        answers.put(village.value(), Answer.json(200, """
                {"ico":"10000020","obchodniJmeno":"Statek Lhota s.r.o.","sidlo":{"kodStatu":"CZ","nazevObce":"Lhota",
                "nazevCastiObce":"Horní Lhota","cisloDomovni":15,"cisloOrientacni":2,"cisloOrientacniPismeno":"a","psc":37001,"typCisloDomovni":1}}"""));

        assertThat(registry.find(village)).flatMap(RegisteredCompany::seat)
                .contains(new PostalAddress("Horní Lhota 15/2a", "Lhota", "370 01"));
    }

    @Test
    @DisplayName("Given a building with a registration number, when it is found, then the number carries the č. ev. prefix")
    void should_prefix_registration_number_when_found_given_registration_building() {
        CompanyIdentifier cottage = new CompanyIdentifier("10000038");
        answers.put(cottage.value(), Answer.json(200, """
                {"ico":"10000038","obchodniJmeno":"Chata s.r.o.","sidlo":{"kodStatu":"CZ","nazevObce":"Lipová","nazevCastiObce":"Lipová",
                "cisloDomovni":7,"psc":79061,"typCisloDomovni":2}}"""));

        assertThat(registry.find(cottage)).flatMap(RegisteredCompany::seat)
                .contains(new PostalAddress("Lipová č. ev. 7", "Lipová", "790 61"));
    }

    @Test
    @DisplayName("Given a seat abroad or without a structured address, when it is found, then only the name comes back")
    void should_return_name_only_when_found_given_seat_abroad_or_unstructured() {
        CompanyIdentifier abroad = new CompanyIdentifier("10000046");
        CompanyIdentifier unstructured = new CompanyIdentifier("10000054");
        answers.put(abroad.value(), Answer.json(200, """
                {"ico":"10000046","obchodniJmeno":"Wien GmbH","sidlo":{"kodStatu":"AT","nazevObce":"Wien","nazevUlice":"Ring","cisloDomovni":1,"psc":1010}}"""));
        answers.put(unstructured.value(), Answer.json(200, """
                {"ico":"10000054","obchodniJmeno":"Bez adresy s.r.o.","sidlo":{"kodStatu":"CZ","textovaAdresa":"Někde 1, 11000 Praha"}}"""));

        assertThat(registry.find(abroad)).hasValueSatisfying(company -> {
            assertThat(company.name()).isEqualTo("Wien GmbH");
            assertThat(company.seat()).isEmpty();
        });
        assertThat(registry.find(unstructured)).hasValueSatisfying(company -> assertThat(company.seat()).isEmpty());
    }

    @Test
    @DisplayName("Given the register does not know the identifier, when it is found, then nothing comes back")
    void should_return_nothing_when_found_given_unknown_identifier() {
        assertThat(registry.find(UNKNOWN)).isEmpty();
    }

    @Test
    @DisplayName("Given a company asked about before, when it is found again within ten minutes, then the register is not asked again")
    void should_answer_from_cache_when_found_again_within_ten_minutes() {
        registry.find(MINISTRY);
        registry.find(UNKNOWN);
        clock.advance(Duration.ofMinutes(9));

        assertThat(registry.find(MINISTRY)).isPresent();
        assertThat(registry.find(UNKNOWN)).isEmpty();
        assertThat(requests.get()).isEqualTo(2);

        clock.advance(Duration.ofMinutes(2));
        registry.find(MINISTRY);
        assertThat(requests.get()).isEqualTo(3);
    }

    @Test
    @DisplayName("Given the register failed, when the same company is found again, then the register is asked again")
    void should_not_cache_failure_when_found_again() {
        answers.put(MINISTRY.value(), Answer.json(503, "{}"));
        assertThatThrownBy(() -> registry.find(MINISTRY)).isInstanceOf(CompanyRegistryUnavailable.class);

        answers.put(MINISTRY.value(), Answer.json(200, MINISTRY_JSON));
        assertThat(registry.find(MINISTRY)).isPresent();
        assertThat(requests.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("Given the register answers with an error, a rate refusal or a redirect, when a company is found, then the register is unavailable with the status")
    void should_be_unavailable_with_status_when_found_given_error_status() {
        for (int status : new int[]{500, 503, 429, 400, 302}) {
            answers.put(MINISTRY.value(), Answer.json(status, "{}"));
            assertThatThrownBy(() -> registry.find(MINISTRY)).isInstanceOf(CompanyRegistryUnavailable.class)
                    .hasMessage("status " + status);
        }
    }

    @Test
    @DisplayName("Given garbage, another company, a missing name or not JSON, when a company is found, then the register is unavailable as an unexpected response")
    void should_be_unavailable_when_found_given_unexpected_body() {
        for (Answer answer : new Answer[]{Answer.json(200, "<html>oops"), Answer.json(200, "[]"),
                Answer.json(200, "{\"ico\":\"45274649\",\"obchodniJmeno\":\"Stavby Novák\"}"), Answer.json(200, "{\"ico\":\"00006947\"}"),
                Answer.json(200, "{\"ico\":\"00006947\",\"obchodniJmeno\":\"" + "x".repeat(200) + "\"}"),
                new Answer(200, "text/html", MINISTRY_JSON, Duration.ZERO)}) {
            answers.put(MINISTRY.value(), answer);
            assertThatThrownBy(() -> registry.find(MINISTRY)).isInstanceOf(CompanyRegistryUnavailable.class)
                    .hasMessage("unexpected response");
        }
    }

    @Test
    @DisplayName("Given an answer larger than 64 KiB, when a company is found, then the register is unavailable as too large")
    void should_be_unavailable_when_found_given_oversized_answer() {
        answers.put(MINISTRY.value(), Answer.json(200, "{\"ico\":\"00006947\",\"obchodniJmeno\":\"" + "x".repeat(70_000) + "\"}"));

        assertThatThrownBy(() -> registry.find(MINISTRY)).isInstanceOf(CompanyRegistryUnavailable.class).hasMessage("too large");
    }

    @Test
    @DisplayName("Given a register that stalls the body or the headers, when a company is found, then it is unavailable as a timeout within the timeout")
    void should_time_out_when_found_given_stalled_answer() {
        answers.put(MINISTRY.value(), new Answer(200, "application/json", MINISTRY_JSON, Duration.ofSeconds(6)));
        CompanyIdentifier silent = new CompanyIdentifier("10000062");
        answers.put(silent.value(), Answer.silentFor(Duration.ofSeconds(6)));
        AresCompanyRegistry impatient = localRegistry(STALL_TIMEOUT);
        long started = System.nanoTime();

        assertThatThrownBy(() -> impatient.find(MINISTRY)).isInstanceOf(CompanyRegistryUnavailable.class).hasMessage("timeout");
        assertThatThrownBy(() -> impatient.find(silent)).isInstanceOf(CompanyRegistryUnavailable.class).hasMessage("timeout");

        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(5_500));
    }

    @Test
    @DisplayName("Given the register cannot be reached, when a company is found, then it is unavailable as unreachable")
    void should_be_unavailable_when_found_given_unreachable_register() {
        server.stop(0);

        assertThatThrownBy(() -> registry.find(MINISTRY)).isInstanceOf(CompanyRegistryUnavailable.class).hasMessage("unreachable");
    }

    @Test
    @DisplayName("Given the production settings, when the register resolves to a private address or is not https, then it is not asked")
    void should_refuse_when_found_given_private_address_or_plain_http() {
        AresCompanyRegistry strict = new AresCompanyRegistry(HttpClient.newHttpClient(), URI.create("https://127.0.0.1:" + port() + "/ekonomicke-subjekty/"),
                false, Duration.ofMillis(500), clock);
        AresCompanyRegistry plain = new AresCompanyRegistry(HttpClient.newHttpClient(), URI.create("http://ares.gov.cz/ekonomicke-subjekty/"),
                false, Duration.ofMillis(500), clock);

        assertThatThrownBy(() -> strict.find(MINISTRY)).isInstanceOf(CompanyRegistryUnavailable.class).hasMessage("non-public address");
        assertThatThrownBy(() -> plain.find(MINISTRY)).isInstanceOf(CompanyRegistryUnavailable.class).hasMessage("not https");
        assertThat(requests.get()).isZero();
    }

    @Test
    @DisplayName("Given the production register, when its address is read, then it is the fixed https address of ARES")
    void should_use_fixed_https_address_given_production_register() {
        assertThat(AresCompanyRegistry.ARES).hasToString("https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/");
    }

    private AresCompanyRegistry localRegistry(Duration timeout) {
        return new AresCompanyRegistry(HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build(),
                URI.create("http://127.0.0.1:" + port() + "/ekonomicke-subjekty/"), true, timeout, clock);
    }

    private int port() {
        return server.getAddress().getPort();
    }

    private record Answer(int status, String contentType, String body, Duration stall) {

        static Answer json(int status, String body) {
            return new Answer(status, "application/json", body, Duration.ZERO);
        }

        static Answer silentFor(Duration stall) {
            return new Answer(0, "application/json", "", stall);
        }

        void send(HttpExchange exchange) throws IOException {
            if (status == 0) {
                pause();
                exchange.close();
                return;
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", contentType);
            if (status == 302) {
                exchange.getResponseHeaders().add("Location", "/elsewhere");
            }
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                if (stall.isZero()) {
                    out.write(bytes);
                } else {
                    out.write(bytes, 0, 1);
                    out.flush();
                    pause();
                }
            } catch (IOException closed) {
                exchange.close();
            }
        }

        private void pause() {
            try {
                Thread.sleep(stall.toMillis());
            } catch (InterruptedException stopped) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
