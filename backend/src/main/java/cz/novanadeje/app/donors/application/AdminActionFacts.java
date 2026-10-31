package cz.novanadeje.app.donors.application;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.UnaryOperator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

public record AdminActionFacts(String summaryKey, Map<String, String> values) {

    public static final String DONOR = "donor";

    private static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private static final String ID = "(?:" + UUID_PATTERN + ")";
    private static final String DONOR_ID = "(?<donor>" + UUID_PATTERN + ")";
    private static final String DAY = "\\d{4}-\\d{2}-\\d{2}";
    private static final String MONEY = "Money\\[amountMinor=(?<amount>-?\\d+), currency=CZK]";
    private static final String WITHOUT_VARIANT = "";
    private static final String WITH_TITLE = "withTitle";
    private static final String INHERITED = "INHERITED";

    private static final Map<String, String> SECTION_CODES = Map.of(
            "dárci", "DONORS", "donors", "DONORS",
            "dary", "DONATIONS", "donations", "DONATIONS",
            "platby bez dárce", "UNPAIRED_PAYMENTS", "unpaired payments", "UNPAIRED_PAYMENTS",
            "stahování z banky", "BANK_IMPORT", "bank import", "BANK_IMPORT");
    private static final List<String> INHERITED_WORDS = List.of("zděděná úroveň", "zděděnou úroveň", "inherited");
    private static final Map<String, UnaryOperator<String>> NORMALIZERS = Map.of(
            "sections", AdminActionFacts::sectionCodes,
            "previous", previous -> INHERITED_WORDS.contains(previous) ? INHERITED : previous,
            "settings", settings -> String.join(",", settings.split(",\\s*")));

    private static final Map<String, List<Shape>> SHAPES = shapes();

    public AdminActionFacts {
        values = Map.copyOf(values);
    }

    public static Optional<AdminActionFacts> read(String action, String details) {
        return SHAPES.getOrDefault(action, List.of()).stream()
                .map(shape -> shape.read(action, details))
                .flatMap(Optional::stream)
                .findFirst();
    }

    public Optional<String> value(String name) {
        return Optional.ofNullable(values.get(name));
    }

    public Optional<UUID> donor() {
        return value(DONOR).map(UUID::fromString);
    }

    private static String sectionCodes(String sections) {
        return Arrays.stream(sections.split(",\\s*")).map(section -> SECTION_CODES.getOrDefault(section, section)).collect(Collectors.joining(","));
    }

    private static Map<String, List<Shape>> shapes() {
        Map<String, List<Shape>> shapes = new LinkedHashMap<>();
        shapes.put("PAIR_PAYMENT", List.of(
                full("Platba (?<transaction>\\d+) \\(" + MONEY + ", zaúčtována (?<booked>" + DAY + ")\\) ručně přiřazena dárci " + DONOR_ID + " jako dar " + ID),
                full("Bank payment (?<transaction>\\d+) \\(" + MONEY + ", booked (?<booked>" + DAY + ")\\) paired by hand with donor " + DONOR_ID
                        + " as donation " + ID)));
        shapes.put("UNPAIR_PAYMENT", List.of(
                full("Dar " + ID + " dárce " + DONOR_ID + " \\(spárován podle (?<method>[A-Z_]+)\\) odebrán z platby (?<transaction>\\d+); platba se od teď"
                        + " páruje jen ručně"),
                full("Donation " + ID + " of donor " + DONOR_ID + " \\(paired by (?<method>[A-Z_]+)\\) removed from bank payment (?<transaction>\\d+); the payment"
                        + " is paired by hand only from now on")));
        shapes.put("GRANT_ADMINISTRATION", List.of(
                full("Role správce udělena dárci " + DONOR_ID),
                full("Administrator role granted to donor " + DONOR_ID)));
        shapes.put("REVOKE_ADMINISTRATION", List.of(
                full("Role správce odebrána dárci " + DONOR_ID + "; všechna přihlášení dárce ukončena"),
                full("Administrator role taken from donor " + DONOR_ID + "; every session of the donor was ended")));
        shapes.put("RESET_SECOND_FACTOR", List.of(
                full("Dvoufaktorové ověření dárce " + DONOR_ID + " vypnuto; všechna přihlášení dárce ukončena"),
                full("Two-factor authentication of donor " + DONOR_ID + " turned off; every session of the donor was ended")));
        shapes.put("RECOVER_SECOND_FACTOR", List.of(
                full("Dvoufaktorové ověření správce " + DONOR_ID + " vypnuto platbou 1 Kč z ověřeného účtu (?<account>\\S+); všechna přihlášení ukončena")));
        shapes.put("REMOVE_PASSKEYS", List.of(
                full("Odebrané přístupové klíče dárce " + DONOR_ID + ": (?<count>\\d+); všechna přihlášení dárce ukončena"),
                full("(?<count>\\d+) passkeys of donor " + DONOR_ID + " removed; every session of the donor was ended")));
        shapes.put("REVERSE_SYMBOL_CLAIM", List.of(
                full("Odpověď Ano " + ID + " dárce " + DONOR_ID + " u symbolu (?<symbol>\\d+) změněna na Ne; smazané dary spárované přes ni: (?<count>\\d+)"),
                full("Confirmed symbol claim " + ID + " of donor " + DONOR_ID + " for symbol (?<symbol>\\d+) reversed to DECLINED; (?<count>\\d+) donation\\(s\\)"
                        + " paired through it deleted")));
        shapes.put("RESET_SYMBOL_CLAIM", List.of(
                full("Odpověď Ne " + ID + " dárce " + DONOR_ID + " u symbolu (?<symbol>\\d+) smazána; účet se dárce může zeptat znovu"),
                full("Declined symbol claim " + ID + " of donor " + DONOR_ID + " for symbol (?<symbol>\\d+) deleted; the account may ask the donor again")));
        shapes.put("DISCONNECT_SENDER_ACCOUNT", List.of(
                full("Párování z účtu (?<account>\\S+) \\(propojení " + ID + "\\) dárce " + DONOR_ID + " vypnuto"),
                full("Pairing from bank account (?<account>\\S+) \\(link " + ID + "\\) of donor " + DONOR_ID + " turned off")));
        shapes.put("RECONNECT_SENDER_ACCOUNT", List.of(
                full("Párování z účtu (?<account>\\S+) \\(propojení " + ID + "\\) dárce " + DONOR_ID + " znovu zapnuto jako propojení " + ID
                        + ", čeká na platbu se symbolem"),
                full("Pairing from bank account (?<account>\\S+) \\(link " + ID + "\\) of donor " + DONOR_ID + " turned on again as link " + ID
                        + ", awaiting a payment with the symbol")));
        shapes.put("REMOVE_SENDER_ACCOUNT_LINK", List.of(
                full("Účet (?<account>\\S+) \\(propojení " + ID + ", [A-Z_]+\\) odebrán dárci " + DONOR_ID + "; smazané dary spárované přes něj:"
                        + " (?<donations>\\d+), smazané odpovědi o starších symbolech: (?<answers>\\d+)"),
                full("Bank account (?<account>\\S+) \\(link " + ID + ", [A-Z_]+\\) removed from donor " + DONOR_ID + "; (?<donations>\\d+) donation\\(s\\)"
                        + " paired through it and (?<answers>\\d+) answer\\(s\\) about older symbols deleted")));
        shapes.put("ERASE_DONOR", List.of(
                full("Osobní údaje dárce " + DONOR_ID + " vymazány: .*"),
                full("Personal data of donor " + DONOR_ID + " erased: .*")));
        shapes.put("CHANGE_REPORT_SETTINGS", List.of(
                full("Nastavení měsíčního přehledu změněno: příjemci (?<recipients>.+); odesílá se (?<day>\\d+)\\. den v měsíci v (?<hour>\\d+):00; části"
                        + " (?<sections>.+)"),
                variant("withoutHour", "Monthly report settings changed: recipients (?<recipients>.+); sent on day (?<day>\\d+) of the month; sections"
                        + " (?<sections>.+)")));
        shapes.put("SEND_MONTHLY_REPORT", List.of(
                full("Měsíční přehled za (?<month>\\d{4}-\\d{2}) ručně odeslán na (?<recipients>.+)"),
                full("Monthly report for (?<month>\\d{4}-\\d{2}) sent by hand to (?<recipients>.+)")));
        shapes.put("CHANGE_RECEIPT_SIGNATURE", List.of(
                full("Nahrán obrázek podpisu na potvrzení o daru: (?<width>\\d+) × (?<height>\\d+) px, SHA-256 \\S+"),
                full("Signature image for receipts uploaded: (?<width>\\d+)x(?<height>\\d+) px, SHA-256 \\S+")));
        shapes.put("REMOVE_RECEIPT_SIGNATURE", List.of(
                full("Obrázek podpisu odebrán; .*"),
                full("Signature image for receipts removed; .*")));
        shapes.put("CHANGE_ABOUT_PHOTO", List.of(
                full("Fotka " + ID + " v sekci O nás nastavena"),
                variant("edited", "Fotka " + ID + " v sekci O nás upravena")));
        shapes.put("REMOVE_ABOUT_PHOTO", List.of(
                full("Fotka " + ID + " v sekci O nás odebrána")));
        shapes.put("ADD_PERSON", List.of(full("Osoba " + ID + " přidána mezi lidi fondu")));
        shapes.put("UPDATE_PERSON", List.of(full("Osoba " + ID + " v lidech fondu upravena")));
        shapes.put("REMOVE_PERSON", List.of(full("Osoba " + ID + " odebrána z lidí fondu")));
        shapes.put("ORDER_PEOPLE", List.of(full("Pořadí lidí fondu změněno")));
        shapes.put("CHANGE_FOUNDERS_NOTE", List.of(
                full("Slovo zakladatelů upraveno"),
                variant("removed", "Slovo zakladatelů odebráno")));
        shapes.put("CHANGE_PEOPLE_FOOTNOTE", List.of(
                full("Řádek pod správní radou upraven"),
                variant("removed", "Řádek pod správní radou odebrán")));
        shapes.put("CHANGE_WEB_SIGNATURE", List.of(full("Podpis " + ID + " na webu u osoby " + ID + " nastaven")));
        shapes.put("REMOVE_WEB_SIGNATURE", List.of(full("Podpis na webu u osoby " + ID + " odebrán")));
        shapes.put("CHANGE_PROJECT_ORDER", List.of(
                full("Řazení projektů na webu změněno z (?<fromOrder>[A-Z_]+) na (?<toOrder>[A-Z_]+)")));
        content(shapes, "NEWS", "Aktualita", "News article", List.of("napsána", "upravena", "zveřejněna od", "stažena z webu", "smazána"));
        content(shapes, "PROJECT", "Projekt", "Project", List.of("napsán", "upraven", "zveřejněn od", "stažen z webu", "smazán"));
        shapes.put("CHANGE_BACKUP_SCHEDULE", List.of(
                full("Plán záloh změněn z „(?<from>[^“]*)“ na „(?<to>[^“]*)“")));
        shapes.put("VIEW_BACKUP_KEY", List.of(
                full("Zobrazen klíč k zálohám \\(ověřeno druhým faktorem\\)")));
        shapes.put("VIEW_BACKUP_KEY_REFUSED", List.of(
                full("Klíč k zálohám se nezobrazil: druhý faktor nesouhlasil")));
        shapes.put("REQUEST_BACKUP", List.of(
                full("Záloha databáze vyžádána \\(požadavek " + ID + "\\)"),
                full("A backup was requested \\(request " + ID + "\\)")));
        shapes.put("REQUEST_TEST_RESTORE", List.of(
                full("Zkušební obnova nejnovější zálohy vyžádána \\(požadavek " + ID + "\\)"),
                full("A test restore of the newest backup was requested \\(request " + ID + "\\)")));
        shapes.put("DOWNLOAD_BACKUP", List.of(
                full("Záloha (?<file>\\S+) \\((?<bytes>\\d+) B\\) stažena"),
                full("The backup (?<file>\\S+) \\((?<bytes>\\d+) bytes\\) was downloaded")));
        shapes.put("RESTORE_BACKUP", List.of(
                full("Vyžádána obnova ze zálohy (?<file>\\S+) \\(požadavek " + ID + "\\); .*"),
                full("A restore of (?<file>\\S+) was requested \\(request " + ID + "\\); .*")));
        shapes.put("BACKUP_RESTORED", List.of(
                variant("withTables", "Databáze obnovena ze zálohy (?<file>\\S+) \\(požadavek " + ID + "\\), tabulek: (?<tables>\\d+)"),
                full("Databáze obnovena ze zálohy (?<file>\\S+) \\(požadavek " + ID + "\\)"),
                variant("withTables", "The database was restored from (?<file>\\S+) \\(request " + ID + "\\), (?<tables>\\d+) tables"),
                full("The database was restored from (?<file>\\S+) \\(request " + ID + "\\)")));
        shapes.put("BACKUP_RESTORE_FAILED", List.of(
                full("Obnova ze zálohy (?<file>\\S+) \\(požadavek " + ID + "\\) selhala(?s:.*)"),
                full("The restore of (?<file>\\S+) \\(request " + ID + "\\) failed(?s:.*)")));
        shapes.put("CHANGE_LOG_LEVEL", List.of(
                full("Logger (?<logger>\\S+) nastaven na (?<level>[A-Z]+) do (?<until>\\S+) \\(předtím: (?<previous>[^)]+)\\)"),
                full("The logger (?<logger>\\S+) was set to (?<level>[A-Z]+) until (?<until>\\S+) \\(before: (?<previous>[^)]+)\\)")));
        shapes.put("RESET_LOG_LEVEL", List.of(
                full("Logger (?<logger>\\S+) vrácen na (?<previous>.+) před koncem dočasné změny"),
                full("The logger (?<logger>\\S+) went back to (?<previous>.+) before its override expired")));
        shapes.put("CHANGE_SETTINGS", List.of(
                full("Změněna nastavení: (?<settings>[A-Z_, ]+); backend se restartuje, aby je použil"),
                full("Settings changed: (?<settings>[A-Z_, ]+); the backend restarts to apply them")));
        return Map.copyOf(shapes);
    }

    private static void content(Map<String, List<Shape>> shapes, String kind, String czechNoun, String englishNoun, List<String> czechVerbs) {
        List<String> actions = List.of("CREATE_", "UPDATE_", "PUBLISH_", "UNPUBLISH_", "DELETE_");
        List<String> englishVerbs = List.of("created", "updated", "published on", "unpublished", "deleted");
        for (int index = 0; index < actions.size(); index++) {
            String on = "PUBLISH_".equals(actions.get(index)) ? " (?<on>" + DAY + ")" : "";
            String czech = czechNoun + " " + ID + " „(?<slug>[^“]+)“ " + czechVerbs.get(index) + on;
            shapes.put(actions.get(index) + kind, List.of(
                    variant(WITH_TITLE, czech + "; titulek „(?<title>(?s:.+))“"),
                    full(czech),
                    full(englishNoun + " " + ID + " '(?<slug>[^']+)' " + englishVerbs.get(index) + on)));
        }
    }

    private static Shape full(String regex) {
        return variant(WITHOUT_VARIANT, regex);
    }

    private static Shape variant(String variant, String regex) {
        return new Shape(variant, Pattern.compile(regex));
    }

    private record Shape(String variant, Pattern pattern) {

        Optional<AdminActionFacts> read(String action, String details) {
            Matcher matcher = pattern.matcher(details);
            if (!matcher.matches()) {
                return Optional.empty();
            }
            Map<String, String> values = new LinkedHashMap<>();
            matcher.namedGroups().keySet().forEach(name -> {
                String value = matcher.group(name);
                if (value != null) {
                    values.put(name, NORMALIZERS.getOrDefault(name, UnaryOperator.identity()).apply(value));
                }
            });
            return Optional.of(new AdminActionFacts(variant.isEmpty() ? action : action + "." + variant, values));
        }
    }
}
