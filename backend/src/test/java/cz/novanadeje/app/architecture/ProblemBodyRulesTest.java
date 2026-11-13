package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.asm.ClassReader;
import org.springframework.asm.ClassVisitor;
import org.springframework.asm.Handle;
import org.springframework.asm.Label;
import org.springframework.asm.MethodVisitor;
import org.springframework.asm.Opcodes;
import org.springframework.asm.Type;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.bind.annotation.ControllerAdvice;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.tngtech.archunit.core.domain.JavaAccess.Predicates.target;
import static com.tngtech.archunit.core.domain.JavaClass.Predicates.assignableTo;
import static com.tngtech.archunit.core.domain.properties.HasName.Predicates.nameMatching;
import static com.tngtech.archunit.core.domain.properties.HasOwner.Predicates.With.owner;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class ProblemBodyRulesTest {

    private static final String CATCH_ALL = "cz.novanadeje.app.shared.interfaces.rest.UnhandledExceptionHandler";
    private static final String STRING_CONCAT_FACTORY = "java/lang/invoke/StringConcatFactory";
    private static final Set<String> TEXT_JOINS = Set.of(
            "java/lang/String.valueOf(Ljava/lang/Object;)Ljava/lang/String;",
            "java/util/Objects.toString(Ljava/lang/Object;)Ljava/lang/String;",
            "java/util/Objects.toString(Ljava/lang/Object;Ljava/lang/String;)Ljava/lang/String;",
            "java/lang/StringBuilder.append(Ljava/lang/Object;)Ljava/lang/StringBuilder;");

    @ArchTest
    static final ArchRule answers_must_not_carry_an_exception_message = noClasses()
            .that().resideInAnyPackage("..interfaces..", "cz.novanadeje.app.shared.infrastructure.security..")
            .should().accessTargetWhere(target(nameMatching("getMessage|getLocalizedMessage|toString"))
                    .and(target(owner(assignableTo(Throwable.class)))))
            .because("an answer takes its texts from the message bundles, never from an exception, whose message and string form may carry a value the client sent (security.md, Output)");

    @ArchTest
    static final ArchRule answers_must_not_join_an_exception_into_a_text = noClasses()
            .that().resideInAnyPackage("..interfaces..", "cz.novanadeje.app.shared.infrastructure.security..")
            .should(joinAThrowableIntoAString())
            .because("joining an exception into a text (\"...\" + exception) calls its toString through invokedynamic, which the rule above cannot see (security.md, Output)");

    @ArchTest
    static final ArchRule every_other_controller_advice_must_be_ordered_before_the_catch_all = classes()
            .that().areMetaAnnotatedWith(ControllerAdvice.class)
            .and().doNotHaveFullyQualifiedName(CATCH_ALL)
            .should().beAnnotatedWith(orderedBefore(Ordered.LOWEST_PRECEDENCE))
            .because("Spring asks the advices in their order and the first one with a matching handler answers, so an advice ordered with or after the catch-all would lose its exceptions to a 500 (docs/system-overview.md, shared, Problem answers)");

    @ArchTest
    static final ArchRule the_catch_all_must_be_ordered_last = classes()
            .that().haveFullyQualifiedName(CATCH_ALL)
            .should().beMetaAnnotatedWith(ControllerAdvice.class)
            .andShould().beAnnotatedWith(orderedAt(Ordered.LOWEST_PRECEDENCE))
            .because("the catch-all answers only what no other advice, by the exception or by one of its causes, answers");

    @Test
    @DisplayName("Given planted answers that read an exception's message, join an exception into a text, advise unordered and order the catch-all first, when the rules check them, then each is reported and a text from the bundle is not")
    void should_report_every_planted_answer_when_checked_given_planted_advices(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.interfaces.rest.PlantedAdvice", """
                        package cz.novanadeje.app.planteda.interfaces.rest;

                        import org.springframework.web.bind.annotation.ControllerAdvice;

                        @ControllerAdvice
                        class PlantedAdvice {

                            String message(IllegalStateException failure) {
                                return failure.getMessage();
                            }

                            String joined(IllegalArgumentException failure) {
                                return "Refused: " + failure;
                            }

                            String joinedCause(IllegalArgumentException failure) {
                                return "Refused: " + failure.getCause();
                            }

                            String valueOf(RuntimeException failure) {
                                return String.valueOf(failure);
                            }

                            String caught(Runnable work) {
                                try {
                                    work.run();
                                    return "done";
                                } catch (RuntimeException failure) {
                                    return "Refused: " + failure;
                                }
                            }

                            String fromTheBundle(IllegalArgumentException failure, String bundled) {
                                return "Refused: " + bundled;
                            }
                        }
                        """,
                CATCH_ALL, """
                        package cz.novanadeje.app.shared.interfaces.rest;

                        import org.springframework.core.annotation.Order;
                        import org.springframework.web.bind.annotation.ControllerAdvice;

                        @ControllerAdvice
                        @Order(1)
                        class UnhandledExceptionHandler {
                        }
                        """));

        assertThat(answers_must_not_carry_an_exception_message.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("message("));
        assertThat(answers_must_not_join_an_exception_into_a_text.evaluate(planted).getFailureReport().getDetails())
                .hasSize(4)
                .anySatisfy(detail -> assertThat(detail).contains(".joined joins"))
                .anySatisfy(detail -> assertThat(detail).contains(".joinedCause joins"))
                .anySatisfy(detail -> assertThat(detail).contains(".valueOf joins"))
                .anySatisfy(detail -> assertThat(detail).contains(".caught joins"));
        assertThat(every_other_controller_advice_must_be_ordered_before_the_catch_all.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("PlantedAdvice"));
        assertThat(the_catch_all_must_be_ordered_last.evaluate(planted).getFailureReport().getDetails())
                .singleElement().satisfies(detail -> assertThat(detail).contains("UnhandledExceptionHandler"));
    }

    private static ArchCondition<JavaClass> joinAThrowableIntoAString() {
        return new ArchCondition<>("join an exception into a text") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                type.getSource().ifPresent(source -> joinedThrowables(source.getUri()).forEach(method ->
                        events.add(SimpleConditionEvent.satisfied(type, type.getName() + "." + method + " joins an exception into a text"))));
            }
        };
    }

    private static List<String> joinedThrowables(URI classFile) {
        List<String> methods = new ArrayList<>();
        try (InputStream bytes = classFile.toURL().openStream()) {
            new ClassReader(bytes).accept(new ClassVisitor(Opcodes.ASM9) {
                @Override
                public MethodVisitor visitMethod(int access, String name, String descriptor, String signature, String[] exceptions) {
                    return new TextJoins(parameterSlots(access, descriptor), () -> methods.add(name));
                }
            }, ClassReader.SKIP_FRAMES);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return methods.stream().distinct().toList();
    }

    private static final class TextJoins extends MethodVisitor {

        private final Map<Integer, Type> parameters;
        private final Runnable found;
        private final Set<Integer> joinedLocals = new HashSet<>();
        private Type lastValue;
        private int lastLocal = -1;

        TextJoins(Map<Integer, Type> parameters, Runnable found) {
            super(Opcodes.ASM9);
            this.parameters = parameters;
            this.found = found;
        }

        @Override
        public void visitVarInsn(int opcode, int local) {
            forget();
            if (opcode == Opcodes.ALOAD) {
                lastLocal = local;
            }
        }

        @Override
        public void visitFieldInsn(int opcode, String owner, String name, String descriptor) {
            forget();
            if (opcode == Opcodes.GETFIELD || opcode == Opcodes.GETSTATIC) {
                lastValue = Type.getType(descriptor);
            }
        }

        @Override
        public void visitMethodInsn(int opcode, String owner, String name, String descriptor, boolean isInterface) {
            if (TEXT_JOINS.contains(owner + "." + name + descriptor)) {
                if (lastValue != null && isThrowable(lastValue) || lastLocal >= 0 && parameters.containsKey(lastLocal) && isThrowable(parameters.get(lastLocal))) {
                    found.run();
                } else if (lastLocal >= 0) {
                    joinedLocals.add(lastLocal);
                }
            }
            forget();
            lastValue = Type.getReturnType(descriptor);
        }

        @Override
        public void visitInvokeDynamicInsn(String name, String descriptor, Handle bootstrap, Object... arguments) {
            if (bootstrap.getOwner().equals(STRING_CONCAT_FACTORY) && Arrays.stream(Type.getArgumentTypes(descriptor)).anyMatch(ProblemBodyRulesTest::isThrowable)) {
                found.run();
            }
            forget();
        }

        @Override
        public void visitLocalVariable(String name, String descriptor, String signature, Label start, Label end, int index) {
            if (joinedLocals.contains(index) && isThrowable(Type.getType(descriptor))) {
                found.run();
            }
        }

        @Override
        public void visitInsn(int opcode) {
            forget();
        }

        @Override
        public void visitIntInsn(int opcode, int operand) {
            forget();
        }

        @Override
        public void visitTypeInsn(int opcode, String type) {
            forget();
        }

        @Override
        public void visitJumpInsn(int opcode, Label label) {
            forget();
        }

        @Override
        public void visitLdcInsn(Object value) {
            forget();
        }

        private void forget() {
            lastValue = null;
            lastLocal = -1;
        }
    }

    private static Map<Integer, Type> parameterSlots(int access, String descriptor) {
        Map<Integer, Type> slots = new HashMap<>();
        int slot = (access & Opcodes.ACC_STATIC) == 0 ? 1 : 0;
        for (Type parameter : Type.getArgumentTypes(descriptor)) {
            slots.put(slot, parameter);
            slot += parameter.getSize();
        }
        return slots;
    }

    private static boolean isThrowable(Type argument) {
        if (argument.getSort() != Type.OBJECT) {
            return false;
        }
        try {
            return Throwable.class.isAssignableFrom(Class.forName(argument.getClassName(), false, ProblemBodyRulesTest.class.getClassLoader()));
        } catch (ClassNotFoundException unknown) {
            return false;
        }
    }

    private static DescribedPredicate<JavaAnnotation<?>> orderedBefore(int order) {
        return DescribedPredicate.describe("@Order before " + order, annotation -> isOrder(annotation) && orderOf(annotation) < order);
    }

    private static DescribedPredicate<JavaAnnotation<?>> orderedAt(int order) {
        return DescribedPredicate.describe("@Order(" + order + ")", annotation -> isOrder(annotation) && orderOf(annotation) == order);
    }

    private static boolean isOrder(JavaAnnotation<?> annotation) {
        return annotation.getRawType().isEquivalentTo(Order.class);
    }

    private static int orderOf(JavaAnnotation<?> annotation) {
        return annotation.get("value").map(Integer.class::cast).orElse(Ordered.LOWEST_PRECEDENCE);
    }
}
