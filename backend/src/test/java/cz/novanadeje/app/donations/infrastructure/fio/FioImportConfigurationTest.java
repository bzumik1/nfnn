package cz.novanadeje.app.donations.infrastructure.fio;

import com.sun.net.httpserver.HttpServer;
import cz.novanadeje.app.donations.application.importing.BankImportProperties;
import cz.novanadeje.app.donations.application.importing.BankImportRequests;
import cz.novanadeje.app.donations.application.importing.ImportBankPaymentsService;
import io.github.bzumik1.fio.AccountStatement;
import io.github.bzumik1.fio.FioClient;
import io.github.bzumik1.fio.FioRateLimitException;
import io.github.bzumik1.fio.Money;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.config.ScheduledTask;
import org.springframework.scheduling.config.ScheduledTaskHolder;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.InstanceOfAssertFactories.type;
import static org.mockito.Mockito.mock;

class FioImportConfigurationTest {

    private static final String TOKEN = "test-token-0123456789";
    private static final String STATEMENT = """
            {"accountStatement": {
              "info": {"accountId": "5544332217", "bankId": "2010", "currency": "CZK", "iban": "CZ2620100000005544332217",
                       "bic": "FIOBCZPPXXX", "openingBalance": 0.00, "closingBalance": 500.00,
                       "dateStart": "2026-10-15+0200", "dateEnd": "2026-10-17+0200", "idFrom": 1001, "idTo": 1001},
              "transactionList": {"transaction": [{
                "column22": {"value": 1001, "name": "ID pohybu", "id": 22},
                "column0": {"value": "2026-10-15+0200", "name": "Datum", "id": 0},
                "column1": {"value": 500.00, "name": "Objem", "id": 1},
                "column14": {"value": "CZK", "name": "Měna", "id": 14},
                "column2": {"value": "2900233333", "name": "Protiúčet", "id": 2},
                "column3": {"value": "2010", "name": "Kód banky", "id": 3},
                "column5": {"value": "0558", "name": "VS", "id": 5},
                "column8": {"value": "Bezhotovostní příjem", "name": "Typ", "id": 8}
              }]}
            }}
            """;

    private final ApplicationContextRunner contexts = new ApplicationContextRunner()
            .withUserConfiguration(FioImportConfiguration.class, FioImportScheduler.class, DisabledBankImportRequests.class, Support.class)
            .withPropertyValues(
                    "app.donations.fio.base-uri=https://fioapi.fio.cz/v1/rest",
                    "app.donations.fio.interval=PT1H",
                    "app.donations.fio.initial-delay=PT30S",
                    "app.donations.fio.request-timeout=PT2M",
                    "app.donations.import.overlap=P3D",
                    "app.donations.import.history-window=P89D",
                    "app.donations.import.history-from=",
                    "app.donations.import.on-demand-cooldown=PT30S");

    @Test
    @DisplayName("Given an empty token, when the context starts, then the Fio client is the disabled one and no import scheduler is created")
    void should_create_disabled_client_when_started_given_empty_token() {
        contexts.withPropertyValues("app.donations.fio.token=").run(context -> {
            assertThat(context).hasSingleBean(FioClient.class);
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(FioImportScheduler.class);
            assertThat(context.getBean(BankImportRequests.class)).isInstanceOf(DisabledBankImportRequests.class);
        });
    }

    @Test
    @DisplayName("Given no token property, when the context starts, then the Fio client is the disabled one and no import scheduler is created")
    void should_create_disabled_client_when_started_given_no_token() {
        contexts.run(context -> {
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(FioImportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given a blank token, when the context starts, then the Fio client is the disabled one and no import scheduler is created")
    void should_create_disabled_client_when_started_given_blank_token() {
        contexts.withPropertyValues("app.donations.fio.token=   ").run(context -> {
            assertThat(context.getBean(FioClient.class)).isInstanceOf(DisabledFioClient.class);
            assertThat(context).doesNotHaveBean(FioImportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given a token, when the context starts, then the Fio client is the library's HTTP client and the import scheduler exists")
    void should_create_http_client_when_started_given_token() {
        contexts.withPropertyValues("app.donations.fio.token=" + TOKEN).run(context -> {
            FioClient client = context.getBean(FioClient.class);
            assertThat(client).isNotInstanceOf(DisabledFioClient.class);
            assertThat(client.getClass().getSimpleName()).isEqualTo("HttpFioClient");
            assertThat(context).hasSingleBean(FioImportScheduler.class);
            assertThat(context.getBean(BankImportRequests.class)).isInstanceOf(FioImportScheduler.class);
        });
    }

    @Test
    @DisplayName("Given a token and scheduling enabled, when the context starts, then one hourly import task is scheduled 30 seconds after the start")
    void should_schedule_hourly_import_when_started_given_token_and_scheduling() {
        contexts.withUserConfiguration(Scheduling.class).withPropertyValues("app.donations.fio.token=" + TOKEN).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(ScheduledTaskHolder.class).getScheduledTasks())
                    .singleElement()
                    .extracting(ScheduledTask::getTask, type(FixedDelayTask.class))
                    .satisfies(task -> {
                        assertThat(task.getIntervalDuration()).isEqualTo(Duration.ofHours(1));
                        assertThat(task.getInitialDelayDuration()).isEqualTo(Duration.ofSeconds(30));
                    });
        });
    }

    @Test
    @DisplayName("Given a token with a character Fio never issues, when the context starts, then startup fails with the reason and without the token")
    void should_fail_startup_when_started_given_malformed_token() {
        contexts.withPropertyValues("app.donations.fio.token=abc'def").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause()
                    .hasMessage("A Fio API token may contain only letters, digits, '-' and '_'");
            assertThat(context.getStartupFailure()).rootCause().message().doesNotContain("abc'def");
        });
    }

    @Test
    @DisplayName("Given a token shorter than Fio issues, when the context starts, then startup fails with the reason and without the token")
    void should_fail_startup_when_started_given_too_short_token() {
        contexts.withPropertyValues("app.donations.fio.token=abc").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().hasMessage("A Fio API token has at least 16 characters");
        });
    }

    @Test
    @DisplayName("Given a plain-http base URI to another host, when the context starts, then startup fails because the token would travel unencrypted")
    void should_fail_startup_when_started_given_plain_http_base_uri() {
        contexts.withPropertyValues("app.donations.fio.token=" + TOKEN, "app.donations.fio.base-uri=http://fioapi.fio.cz/v1/rest").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).rootCause().message().startsWith("The Fio API base URI must use https");
        });
    }

    @Test
    @DisplayName("Given a token and a bank at the base URI, when movements are fetched, then the configured client reads the bank's statement")
    void should_read_statement_when_fetched_given_bank_at_base_uri() throws IOException {
        try (StubBank bank = StubBank.answering(200, STATEMENT)) {
            contexts.withPropertyValues("app.donations.fio.token=" + TOKEN, "app.donations.fio.base-uri=" + bank.baseUri()).run(context -> {
                AccountStatement statement = context.getBean(FioClient.class).transactions()
                        .between(LocalDate.of(2026, 10, 15), LocalDate.of(2026, 10, 17)).fetch();

                assertThat(bank.paths()).containsExactly("/v1/rest/periods/" + TOKEN + "/2026-10-15/2026-10-17/transactions.json");
                assertThat(statement.info().dateStart()).isEqualTo(LocalDate.of(2026, 10, 15));
                assertThat(statement.transactions()).singleElement().satisfies(transaction -> {
                    assertThat(transaction.id()).isEqualTo(1001);
                    assertThat(transaction.amount()).isEqualTo(Money.czk("500.00"));
                    assertThat(transaction.typeLabel()).isEqualTo("Bezhotovostní příjem");
                    assertThat(transaction.symbols().variable()).isEqualTo("0558");
                });
            });
        }
    }

    @Test
    @DisplayName("Given the bank refuses with 409, when movements are fetched, then the configured client fails at once instead of waiting for the next slot")
    void should_fail_at_once_when_fetched_given_bank_refuses_with_409() throws IOException {
        try (StubBank bank = StubBank.answering(409, "")) {
            contexts.withPropertyValues("app.donations.fio.token=" + TOKEN, "app.donations.fio.base-uri=" + bank.baseUri()).run(context -> {
                FioClient client = context.getBean(FioClient.class);

                assertThatExceptionOfType(FioRateLimitException.class)
                        .isThrownBy(() -> client.transactions().between(LocalDate.of(2026, 10, 15), LocalDate.of(2026, 10, 17)).fetch())
                        .satisfies(refusal -> assertThat(refusal.statusCode()).hasValue(409));
                assertThat(bank.paths()).hasSize(1);
            });
        }
    }

    @Test
    @DisplayName("Given a history start that is not an ISO date, when the context starts, then startup fails naming FIO_HISTORY_FROM")
    void should_fail_startup_when_started_given_malformed_history_from() {
        contexts.withPropertyValues("app.donations.fio.token=" + TOKEN, "app.donations.import.history-from=1.1.2025").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure()).hasStackTraceContaining("FIO_HISTORY_FROM must be a date in the form YYYY-MM-DD");
        });
    }

    private static final class StubBank implements AutoCloseable {

        private final HttpServer server;
        private final List<String> paths = new CopyOnWriteArrayList<>();

        private StubBank(HttpServer server) {
            this.server = server;
        }

        static StubBank answering(int status, String body) throws IOException {
            StubBank bank = new StubBank(HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0));
            bank.server.createContext("/", exchange -> {
                bank.paths.add(exchange.getRequestURI().getPath());
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(bytes);
                }
            });
            bank.server.start();
            return bank;
        }

        URI baseUri() {
            return URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/v1/rest");
        }

        List<String> paths() {
            return List.copyOf(paths);
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }

    @Configuration(proxyBeanMethods = false)
    @EnableScheduling
    static class Scheduling {
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties({FioImportProperties.class, BankImportProperties.class})
    static class Support {

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }

        @Bean
        ImportBankPaymentsService importBankPaymentsService() {
            return mock(ImportBankPaymentsService.class);
        }

        @Bean
        TaskScheduler taskScheduler() {
            return mock(TaskScheduler.class);
        }
    }
}
