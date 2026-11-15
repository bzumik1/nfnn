package cz.novanadeje.app.shared.interfaces.rest;

import cz.novanadeje.app.shared.domain.error.DomainException;
import org.springframework.web.ErrorResponseException;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.Reader;
import java.io.UncheckedIOException;
import java.lang.classfile.Attributes;
import java.lang.classfile.ClassFile;
import java.lang.classfile.ClassModel;
import java.lang.classfile.Instruction;
import java.lang.classfile.MethodModel;
import java.lang.classfile.Opcode;
import java.lang.classfile.constantpool.StringEntry;
import java.lang.classfile.instruction.InvokeDynamicInstruction;
import java.lang.classfile.instruction.InvokeInstruction;
import java.lang.classfile.instruction.LoadInstruction;
import java.lang.constant.ClassDesc;
import java.lang.constant.ConstantDescs;
import java.lang.reflect.AccessFlag;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
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
                            SortedSet<String> errorResponses, SortedSet<String> irregularCodes, SortedSet<String> failuresWithoutCode,
                            SortedSet<String> failuresForwardingACode) {

    private static final String KEY_PREFIX = "problem.";
    private static final String ERROR_RESPONSE_PREFIX = "problemDetail.";
    private static final String ERROR_RESPONSE_TITLE_PREFIX = ERROR_RESPONSE_PREFIX + "title.";
    private static final char CONCATENATED_VALUE = '\u0001';
    private static final String ANY_COMPLETION = "…";
    private static final String SEGMENT = "[a-z0-9]+(-[a-z0-9]+)*";
    private static final Pattern CODE = Pattern.compile(SEGMENT + "(/" + SEGMENT + ")+");
    private static final Pattern NAMESPACE = Pattern.compile("(" + SEGMENT + "/)+");
    private static final Pattern CODE_CHARACTERS = Pattern.compile("[a-z0-9/-]+");
    private static final Pattern WHITESPACE = Pattern.compile("\\s");
    private static final String DOMAIN_EXCEPTION = internalName(DomainException.class);
    private static final String ERROR_RESPONSE_EXCEPTION = internalName(ErrorResponseException.class);
    private static final String REST_PACKAGE = "/interfaces/rest/";
    private static final List<String> TEXT_PARTS = List.of("title", "detail");

    static ProblemTextCatalogue ofMainClasses(Collection<Class<? extends Exception>> frameworkAnswers) {
        try {
            return of(List.of(Path.of(DomainException.class.getProtectionDomain().getCodeSource().getLocation().toURI())), frameworkAnswers);
        } catch (URISyntaxException unreadable) {
            throw new IllegalStateException(unreadable);
        }
    }

    static ProblemTextCatalogue of(List<Path> classFolders, Collection<Class<? extends Exception>> frameworkAnswers) {
        Map<String, ClassModel> classes = classFolders.stream()
                .flatMap(ProblemTextCatalogue::classFiles)
                .map(ProblemTextCatalogue::parsed)
                .collect(Collectors.toMap(model -> model.thisClass().asInternalName(), Function.identity()));
        Map<String, List<ClassModel>> nestMembersByHost = nestMembersByHost(classes.values());
        SortedSet<String> codes = new TreeSet<>();
        SortedSet<String> keysRead = new TreeSet<>();
        SortedSet<String> keyPrefixesRead = new TreeSet<>();
        SortedSet<String> errorResponses = frameworkAnswers.stream().map(Class::getName).collect(Collectors.toCollection(TreeSet::new));
        SortedSet<String> irregularCodes = new TreeSet<>();
        SortedSet<String> failuresWithoutCode = new TreeSet<>();
        SortedSet<String> failuresForwardingACode = new TreeSet<>();
        for (ClassModel model : classes.values()) {
            String name = model.thisClass().asInternalName();
            boolean concrete = !model.flags().has(AccessFlag.ABSTRACT);
            if (extendsClass(name, DOMAIN_EXCEPTION, DomainException.class, classes)) {
                List<ClassModel> readWithIt = Stream.concat(Stream.of(model), nestMembersByHost.getOrDefault(name, List.of()).stream()).toList();
                List<String> candidates = new ArrayList<>();
                for (ClassModel read : readWithIt) {
                    List<String> found = strings(read).filter(ProblemTextCatalogue::isCodeCandidate).toList();
                    candidates.addAll(found);
                    found.stream().filter(text -> !isCode(text))
                            .map(text -> readable(read.thisClass().asInternalName()) + ": " + printable(text))
                            .forEach(irregularCodes::add);
                }
                candidates.stream().filter(ProblemTextCatalogue::isCode).forEach(codes::add);
                if (candidates.isEmpty() && concrete) {
                    failuresWithoutCode.add(readable(name));
                }
                if (concrete && forwardsAParameterAsTheCode(model)) {
                    failuresForwardingACode.add(readable(name));
                }
            }
            if (concrete && extendsClass(name, ERROR_RESPONSE_EXCEPTION, ErrorResponseException.class, classes)) {
                errorResponses.add(readable(name));
            }
            if (name.contains(REST_PACKAGE)) {
                strings(model).filter(text -> text.startsWith(KEY_PREFIX)).forEach(text -> recordKeyRead(text, keysRead, keyPrefixesRead));
            }
        }
        return new ProblemTextCatalogue(codes, keysRead, keyPrefixesRead, errorResponses, irregularCodes, failuresWithoutCode,
                failuresForwardingACode);
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

    static boolean isProblemKey(String key) {
        return key.startsWith(KEY_PREFIX) || key.startsWith(ERROR_RESPONSE_PREFIX);
    }

    SortedSet<String> requiredKeys() {
        SortedSet<String> keys = new TreeSet<>(keysRead);
        codes.forEach(code -> TEXT_PARTS.forEach(part -> keys.add(KEY_PREFIX + code + "." + part)));
        errorResponses.forEach(exception -> {
            keys.add(ERROR_RESPONSE_TITLE_PREFIX + exception);
            keys.add(ERROR_RESPONSE_PREFIX + exception);
        });
        return keys;
    }

    List<String> missingTexts(Map<String, Properties> bundlesByLanguage, Set<String> keptPrefixes) {
        Set<String> requiredOrRead = new TreeSet<>(requiredKeys());
        bundlesByLanguage.values().forEach(bundle -> problemKeys(bundle)
                .filter(key -> isUnderAPrefixRead(key) || isUnder(key, keptPrefixes))
                .forEach(requiredOrRead::add));
        Stream<String> missingKeys = requiredOrRead.stream()
                .flatMap(key -> bundlesByLanguage.entrySet().stream()
                        .filter(bundle -> !bundle.getValue().containsKey(key))
                        .map(bundle -> key + " (" + bundle.getKey() + ")"));
        Stream<String> emptyPrefixes = keyPrefixesRead.stream()
                .flatMap(prefix -> bundlesByLanguage.entrySet().stream()
                        .filter(bundle -> problemKeys(bundle.getValue()).noneMatch(key -> key.startsWith(prefix)))
                        .map(bundle -> prefix + ANY_COMPLETION + " (" + bundle.getKey() + ")"));
        return Stream.concat(missingKeys, emptyPrefixes).toList();
    }

    List<String> orphanTexts(Collection<Properties> bundles, Set<String> keptPrefixes) {
        Set<String> required = requiredKeys();
        return bundles.stream()
                .flatMap(ProblemTextCatalogue::problemKeys)
                .filter(key -> !required.contains(key) && !isUnderAPrefixRead(key) && !isUnder(key, keptPrefixes))
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
        return isUnder(key, keyPrefixesRead);
    }

    private static boolean isUnder(String key, Set<String> prefixes) {
        return prefixes.stream().anyMatch(key::startsWith);
    }

    private static Stream<String> problemKeys(Properties bundle) {
        return bundle.stringPropertyNames().stream().filter(ProblemTextCatalogue::isProblemKey);
    }

    private static boolean isCodeCandidate(String text) {
        if (WHITESPACE.matcher(text).find() || NAMESPACE.matcher(text).matches()) {
            return false;
        }
        return text.contains("/") || CODE_CHARACTERS.matcher(text).matches() && text.contains("-");
    }

    private static boolean isCode(String text) {
        return CODE.matcher(text).matches();
    }

    private static boolean forwardsAParameterAsTheCode(ClassModel model) {
        String superclass = model.superclass().map(entry -> entry.asInternalName()).orElse("");
        return model.methods().stream()
                .filter(method -> method.methodName().equalsString(ConstantDescs.INIT_NAME) && !method.flags().has(AccessFlag.PRIVATE))
                .anyMatch(constructor -> passesAStringParameterFirst(constructor, superclass));
    }

    private static boolean passesAStringParameterFirst(MethodModel constructor, String superclass) {
        List<Instruction> instructions = constructor.findAttribute(Attributes.code()).stream()
                .flatMap(code -> code.elementStream())
                .filter(Instruction.class::isInstance)
                .map(Instruction.class::cast)
                .toList();
        int superCall = indexOfSuperCall(instructions, superclass);
        int receiver = superCall < 0 ? -1 : lastLoadOfThisBefore(instructions, superCall);
        if (receiver < 0 || receiver + 2 > superCall) {
            return false;
        }
        int afterFirstArgument = receiver + 2;
        Instruction next = instructions.get(afterFirstArgument);
        boolean transformed = afterFirstArgument != superCall && (next instanceof InvokeInstruction || next instanceof InvokeDynamicInstruction);
        return instructions.get(receiver + 1) instanceof LoadInstruction load && stringParameterSlots(constructor).contains(load.slot()) && !transformed;
    }

    private static int indexOfSuperCall(List<Instruction> instructions, String superclass) {
        for (int index = 0; index < instructions.size(); index++) {
            if (instructions.get(index) instanceof InvokeInstruction invoke
                    && invoke.opcode() == Opcode.INVOKESPECIAL
                    && invoke.name().equalsString(ConstantDescs.INIT_NAME)
                    && invoke.owner().asInternalName().equals(superclass)
                    && !invoke.typeSymbol().parameterList().isEmpty()
                    && invoke.typeSymbol().parameterType(0).equals(ConstantDescs.CD_String)) {
                return index;
            }
        }
        return -1;
    }

    private static int lastLoadOfThisBefore(List<Instruction> instructions, int superCall) {
        for (int index = superCall - 1; index >= 0; index--) {
            if (instructions.get(index) instanceof LoadInstruction load && load.slot() == 0) {
                return index;
            }
        }
        return -1;
    }

    private static Set<Integer> stringParameterSlots(MethodModel constructor) {
        Set<Integer> slots = new TreeSet<>();
        int slot = 1;
        for (ClassDesc parameter : constructor.methodTypeSymbol().parameterList()) {
            if (parameter.equals(ConstantDescs.CD_String)) {
                slots.add(slot);
            }
            slot += parameter.equals(ConstantDescs.CD_long) || parameter.equals(ConstantDescs.CD_double) ? 2 : 1;
        }
        return slots;
    }

    private static Map<String, List<ClassModel>> nestMembersByHost(Collection<ClassModel> classes) {
        Map<String, List<ClassModel>> members = new HashMap<>();
        classes.forEach(model -> model.findAttribute(Attributes.nestHost())
                .ifPresent(host -> members.computeIfAbsent(host.nestHost().asInternalName(), ignored -> new ArrayList<>()).add(model)));
        return members;
    }

    private static boolean extendsClass(String internalName, String rootName, Class<?> root, Map<String, ClassModel> classes) {
        if (internalName.equals(rootName)) {
            return true;
        }
        return Optional.ofNullable(classes.get(internalName))
                .map(model -> model.superclass().map(superclass -> extendsClass(superclass.asInternalName(), rootName, root, classes)).orElse(false))
                .orElseGet(() -> root.isAssignableFrom(loaded(internalName)));
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

    private static String internalName(Class<?> type) {
        return type.getName().replace('.', '/');
    }

    private static String readable(String internalName) {
        return internalName.replace('/', '.');
    }

    private static String printable(String text) {
        return text.replace(CONCATENATED_VALUE, '…');
    }
}
