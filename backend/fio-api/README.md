# fio-api

A small Java 25 client for the read side of the [Fio banka](https://www.fio.cz) REST API ("API Bankovnictví",
documentation version 1.9 of 16 October 2025). It downloads account movements as JSON and maps them to typed,
immutable records, and it moves the server-side bookmark ("zarážka") that marks the last downloaded movement.

It is a standalone library: package `cz.novanadeje.fio`, no Spring, and no runtime dependency other than Jackson 3
(`tools.jackson.core:jackson-databind`). HTTP goes through `java.net.http.HttpClient`. Nothing in it knows about the
application it currently lives next to.

## Usage

```java
FioClient fio = FioClient.builder(FioToken.of(System.getenv("FIO_TOKEN"))).build();

FioStatement statement = fio.newTransactions();
for (FioTransaction transaction : statement.transactions()) {
    if (transaction.amount().signum() > 0) {
        System.out.println(transaction.date() + " " + transaction.amount() + " " + transaction.currency()
                + " VS " + transaction.variableSymbol() + " from " + transaction.counterpartyName());
    }
}
```

| Method | Endpoint | What it does |
|---|---|---|
| `newTransactions()` | `GET /last/{token}/transactions.json` | Movements since the last download. The bank moves its bookmark to the newest movement it returns; an empty answer leaves the bookmark where it was. |
| `transactionsBetween(from, to)` | `GET /periods/{token}/{from}/{to}/transactions.json` | Movements dated from `from` to `to` (`yyyy-MM-dd`). |
| `setLastDownloadedId(id)` | `GET /set-last-id/{token}/{id}/` | Moves the bookmark to the last movement downloaded successfully, so the next `newTransactions()` starts after it. |
| `setLastDownloadedDate(date)` | `GET /set-last-date/{token}/{date}/` | Moves the bookmark to the last day that was *not* downloaded successfully; in the documentation's example the next download starts with that day's movements. |

The builder also takes a base URI (default `https://fioapi.fio.cz/v1/rest`, change it for a stub server in tests),
an `HttpClient` (default: one with a 10-second connect timeout), a `Clock` (used for `FioRateLimitException.retryAfter()`)
and a request timeout (default 2 minutes). A `FioClient` is immutable and safe to share between threads.

## The token

Each token belongs to one account and is created in Fio internet banking (Nastavení > API); it becomes usable
five minutes after it is authorised and lives at most 180 days unless it is renewed. A "Sledování účtu" token is
enough for everything this library does.

`FioToken` never shows its value: `toString()` prints `FioToken[***]`, and every message, response body and cause
the client puts into an exception has the token replaced by `***`. Surrounding whitespace is stripped, so a token
read from a file with a trailing newline works.

## Limits the caller has to respect

- **One request per token per 30 seconds** (`FioClient.MINIMUM_REQUEST_INTERVAL`), whatever the endpoint or format:
  "a token can be used only once for reading or writing within 30 seconds". Treat the bookmark calls as requests
  too, so `setLastDownloadedId(...)` followed by `newTransactions()` needs 30 seconds between them. The client neither waits nor throttles; a request made too early fails with
  `FioRateLimitException` (HTTP 409), whose `retryAfter()` is 30 seconds after the refusal.
- **90 days of history.** Movements older than 90 days are only available for 10 minutes after the account
  holder unlocks the full history for the token in internet banking (Nastavení > API, the lock icon). Without it the
  API answers HTTP 422, which becomes `FioHistoryLockedException`.
- **50 000 movements per download.** A larger answer is refused with HTTP 413 (a plain `FioException`); ask for a
  shorter period or move the bookmark forward.

## The model

- `FioStatement(info, transactions)`: one download.
- `FioAccountInfo`: the `info` block. Account number, bank code, currency, IBAN, BIC, opening and closing balance
  (`BigDecimal`), the period (`LocalDate`), and the ids of the first, last and last downloaded movement (`Long`).
- `FioTransaction`: one movement, mapped from the documented columns:

| Column | Fio name | Field | Type |
|---|---|---|---|
| 22 | ID pohybu | `id` | `long` |
| 0 | Datum | `date` | `LocalDate` |
| 1 | Objem | `amount` | `BigDecimal`, negative for outgoing |
| 14 | Měna | `currency` | `String` |
| 2 | Protiúčet | `counterpartyAccount` | `String` |
| 3 | Kód banky | `counterpartyBankCode` | `String` |
| 12 | Název banky | `counterpartyBankName` | `String` |
| 10 | Název protiúčtu | `counterpartyName` | `String` |
| 4 | KS | `constantSymbol` | `String` |
| 5 | VS | `variableSymbol` | `String` |
| 6 | SS | `specificSymbol` | `String` |
| 7 | Uživatelská identifikace | `userIdentification` | `String` |
| 8 | Typ | `type` | `String` |
| 9 | Provedl | `executedBy` | `String` |
| 16 | Zpráva pro příjemce | `messageForRecipient` | `String` |
| 17 | ID pokynu | `instructionId` | `Long` |
| 18 | Upřesnění | `detail` | `String` |
| 25 | Komentář | `comment` | `String` |
| 26 | BIC | `bic` | `String` |
| 27 | Reference plátce | `payerReference` | `String` |

The symbols stay strings because they keep their leading zeros (`"0558"`).

**Missing values.** What the documentation marks as mandatory is never `null`: `id`, `date`, `amount`, `currency`
and `type` of a movement; `accountId`, `currency`, `iban`, `bic`, `openingBalance` and `closingBalance` of the info
block. A statement without one of them is rejected. Every other field is `null` when the API sends `null`, leaves
the column out, or sends only whitespace (Fio often sends `" "` for an empty comment).

**Raw columns.** `FioTransaction.columns()` keeps every column the API sent, keyed by its id, as
`FioColumn(id, name, value)` with the value as the raw JSON text (`"-1.00"`, `" "`, `"2012-06-26+0200"`). A column this
model does not know yet is still there.

**Dates.** The documentation describes dates as `yyyy-MM-dd+GMT` (`2012-07-27+0200`); the client takes the calendar
date and drops the offset. Its JSON examples instead show epoch milliseconds (`1340661600000`); those are read as
the date in Europe/Prague, which gives the same day.

**Amounts** are `BigDecimal` exactly as sent, scale included (`1.00`, not `1`).

## Errors

Everything the client throws for a failed request is an unchecked `FioException`, a sealed hierarchy:

| Exception | When |
|---|---|
| `FioRateLimitException` | HTTP 409: the token was used less than 30 seconds ago. `retryAfter()` says when to try again. |
| `FioAuthorizationException` | HTTP 500, which the documentation names for a token that does not exist or is not active; also 401 and 403, which it does not list but which mean the same. |
| `FioHistoryLockedException` | HTTP 422: older than 90 days and the history is not unlocked. |
| `FioTransportException` | No answer: connection refused, timeout, interrupted. No status code. |
| `FioException` | Any other non-2xx status (404 for a malformed URL, 413 for too many movements, ...), or a 2xx answer that is not an account statement. |

`statusCode()` and `responseBody()` are empty for a transport failure. Invalid arguments (a period that ends before it
starts, a negative id) throw `IllegalArgumentException` before any request is sent.

## Building and testing

From `backend/`:

```
./gradlew :fio-api:test
./gradlew :fio-api:build
```

The tests need no network and no Docker: the JSON mapping runs against fixtures built from the documentation's
examples (`src/test/resources/cz/novanadeje/fio/`), and the HTTP behaviour against an in-process
`com.sun.net.httpserver.HttpServer`.

## Moving it into its own repository

Nothing in `fio-api` depends on the application, so it can move as it is:

1. Copy `backend/fio-api/` into a new repository, add a Gradle wrapper and a `settings.gradle.kts` with
   `rootProject.name = "fio-api"` (plus the foojay toolchain resolver plugin if the JDK should be downloaded).
2. Add `maven-publish` to `build.gradle.kts` and publish it, for example to GitHub Packages.
3. In the application, drop `include("fio-api")` from `settings.gradle.kts`, replace
   `implementation(project(":fio-api"))` with the published coordinates `cz.novanadeje:fio-api:<version>`, and
   remove the `COPY fio-api ./fio-api` line from `backend/Dockerfile`.
