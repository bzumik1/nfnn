package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.domain.error.DomainException;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.lang.classfile.ClassFile;
import java.lang.classfile.ClassModel;
import java.lang.classfile.constantpool.StringEntry;
import java.lang.reflect.AccessFlag;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.Set;
import java.util.SortedSet;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;

record ProblemTextCatalogue(SortedSet<String> codes, SortedSet<String> keysRead, SortedSet<String> keyPrefixesRead,
                            SortedSet<String> irregularCodes, SortedSet<String> failuresWithoutCode) {

    private static final String KEY_PREFIX = "problem.";
    private static final char CONCATENATED_VALUE = '\u0001';
    private static final String SEGMENT = "[a-z0-9]+(-[a-z0-9]+)*";
    private static final Pattern CODE = Pattern.compile(SEGMENT + "(/" + SEGMENT + ")+");
    private static final Pattern NAMESPACE = Pattern.compile("(" + SEGMENT + "/)+");
    private static final Pattern WHITESPACE = Pattern.compile("\\s");
    private static final String DOMAIN_EXCEPTION = DomainException.class.getName().replace('.', '/');
    private static final String REST_PACKAGE = "/interfaces/rest/";
    private static final List<String> TEXT_PARTS = List.of("title", "detail");

    static ProblemTextCatalogue ofMainClasses() {
        try {
            return of(List.of(Path.of(DomainException.class.getProtectionDomain().getCodeSource().getLocation().toURI())));
        } catch (URISyntaxException unreadable) {
            throw new IllegalStateException(unreadable);
        }
    }

    static ProblemTextCatalogue of(List<Path> classFolders) {
        Map<String, ClassModel> classes = classFolders.stream()
                .flatMap(ProblemTextCatalogue::classFiles)
                .map(ProblemTextCatalogue::parsed)
                .collect(Collectors.toMap(model -> model.thisClass().asInternalName(), Function.identity()));
        SortedSet<String> codes = new TreeSet<>();
        SortedSet<String> keysRead = new TreeSet<>();
        SortedSet<String> keyPrefixesRead = new TreeSet<>();
        SortedSet<String> irregularCodes = new TreeSet<>();
        SortedSet<String> failuresWithoutCode = new TreeSet<>();
        for (ClassModel model : classes.values()) {
            String name = model.thisClass().asInternalName();
            if (isFailure(name, classes)) {
                List<String> candidates = strings(model)
                        .filter(text -> text.contains("/") && !WHITESPACE.matcher(text).find() && !NAMESPACE.matcher(text).matches())
                        .toList();
                candidates.stream().filter(ProblemTextCatalogue::isCode).forEach(codes::add);
                candidates.stream().filter(text -> !isCode(text)).map(text -> readable(name) + ": " + printable(text)).forEach(irregularCodes::add);
                if (candidates.isEmpty() && !model.flags().has(AccessFlag.ABSTRACT)) {
                    failuresWithoutCode.add(readable(name));
                }
            }
            if (name.contains(REST_PACKAGE)) {
                strings(model).filter(text -> text.startsWith(KEY_PREFIX)).forEach(text -> recordKeyRead(text, keysRead, keyPrefixesRead));
            }
        }
        return new ProblemTextCatalogue(codes, keysRead, keyPrefixesRead, irregularCodes, failuresWithoutCode);
    }

    static Properties bundle(InputStream source) {
        try (Reader reader = new InputStreamReader(source, StandardCharsets.UTF_8)) {
            Properties texts = new Properties();
            texts.load(reader);
            return texts;
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    SortedSet<String> requiredKeys() {
        SortedSet<String> keys = new TreeSet<>(keysRead);
        codes.forEach(code -> TEXT_PARTS.forEach(part -> keys.add(KEY_PREFIX + code + "." + part)));
        return keys;
    }

    List<String> missingTexts(Map<String, Properties> bundlesByLanguage) {
        Set<String> requiredOrRead = new TreeSet<>(requiredKeys());
        bundlesByLanguage.values().forEach(bundle -> problemKeys(bundle).filter(this::isUnderAPrefixRead).forEach(requiredOrRead::add));
        return requiredOrRead.stream()
                .flatMap(key -> bundlesByLanguage.entrySet().stream()
                        .filter(bundle -> !bundle.getValue().containsKey(key))
                        .map(bundle -> key + " (" + bundle.getKey() + ")"))
                .toList();
    }

    List<String> orphanTexts(Collection<Properties> bundles, Set<String> keptPrefixes) {
        Set<String> required = requiredKeys();
        return bundles.stream()
                .flatMap(ProblemTextCatalogue::problemKeys)
                .filter(key -> !required.contains(key) && !isUnderAPrefixRead(key) && keptPrefixes.stream().noneMatch(key::startsWith))
                .distinct()
                .sorted()
                .toList();
    }

    private static void recordKeyRead(String text, Set<String> keysRead, Set<String> keyPrefixesRead) {
        int joined = text.indexOf(CONCATENATED_VALUE);
        String literal = joined < 0 ? text : text.substring(0, joined);
        if (literal.length() == KEY_PREFIX.length()) {
            return;
        }
        if (joined < 0 && !literal.endsWith(".")) {
            keysRead.add(literal);
        } else {
            keyPrefixesRead.add(literal);
        }
    }

    private boolean isUnderAPrefixRead(String key) {
        return keyPrefixesRead.stream().anyMatch(key::startsWith);
    }

    private static Stream<String> problemKeys(Properties bundle) {
        return bundle.stringPropertyNames().stream().filter(key -> key.startsWith(KEY_PREFIX));
    }

    private static boolean isCode(String text) {
        return CODE.matcher(text).matches();
    }

    private static boolean isFailure(String internalName, Map<String, ClassModel> classes) {
        if (internalName.equals(DOMAIN_EXCEPTION)) {
            return true;
        }
        return Optional.ofNullable(classes.get(internalName))
                .map(model -> model.superclass().map(superclass -> isFailure(superclass.asInternalName(), classes)).orElse(false))
                .orElseGet(() -> DomainException.class.isAssignableFrom(loaded(internalName)));
    }

    private static Class<?> loaded(String internalName) {
        try {
            return Class.forName(internalName.replace('/', '.'), false, ProblemTextCatalogue.class.getClassLoader());
        } catch (ClassNotFoundException missing) {
            throw new IllegalStateException(missing);
        }
    }

    private static Stream<String> strings(ClassModel model) {
        return StreamSupport.stream(model.constantPool().spliterator(), false)
                .filter(StringEntry.class::isInstance)
                .map(entry -> ((StringEntry) entry).stringValue());
    }

    private static Stream<Path> classFiles(Path folder) {
        try (Stream<Path> files = Files.walk(folder)) {
            return files.filter(file -> file.toString().endsWith(".class")).toList().stream();
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    private static ClassModel parsed(Path classFile) {
        try {
            return ClassFile.of().parse(classFile);
        } catch (IOException unreadable) {
            throw new UncheckedIOException(unreadable);
        }
    }

    private static String readable(String internalName) {
        return internalName.replace('/', '.');
    }

    private static String printable(String text) {
        return text.replace(CONCATENATED_VALUE, '…');
    }
}
