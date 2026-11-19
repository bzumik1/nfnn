package cz.novanadeje.app.architecture;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.AccessTarget.CodeUnitAccessTarget;
import com.tngtech.archunit.core.domain.AccessTarget.ConstructorCallTarget;
import com.tngtech.archunit.core.domain.AccessTarget.ConstructorReferenceTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import cz.novanadeje.app.AppApplication;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.security.SecureRandomSpi;
import java.util.Collections;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.concurrent.ThreadLocalRandom;
import java.util.random.RandomGenerator;
import java.util.random.RandomGeneratorFactory;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class RandomnessRulesTest {

    private static final Set<String> GENERATOR_FACTORIES = Set.of("of", "getDefault");
    private static final Set<Class<?>> WEAK_GENERATORS = Set.of(ThreadLocalRandom.class, SplittableRandom.class, RandomGeneratorFactory.class);
    private static final Set<String> WEAK_LIBRARY_GENERATORS = Set.of("org.apache.commons.text.RandomStringGenerator",
            "org.apache.commons.lang3.RandomStringUtils", "org.apache.commons.lang3.RandomUtils");
    private static final String SITE = "cz.novanadeje.app";
    private static final String ARRAY_UTILS = "org.apache.commons.lang3.ArrayUtils";
    private static final String SEED_RANDOM = "cz.novanadeje.app.donations.infrastructure.signing.Ed25519ReceiptSigner$SeedRandom";

    private static final DescribedPredicate<JavaAccess<?>> WEAK_RANDOMNESS = DescribedPredicate.describe(
            "a use of java.util.Random, a construction of a RandomGenerator but a SecureRandom, ThreadLocalRandom, SplittableRandom,"
                    + " Math.random, StrictMath.random, a RandomGenerator of the JDK's algorithms (RandomGenerator.of or getDefault,"
                    + " RandomGeneratorFactory), a seeded SecureRandom (setSeed, the byte[] constructor), commons-text's RandomStringGenerator,"
                    + " commons-lang3's RandomStringUtils and RandomUtils, or Collections.shuffle or ArrayUtils.shuffle without a generator",
            RandomnessRulesTest::usesWeakRandomness);

    @ArchTest
    static final ArchRule randomness_comes_only_from_secure_random = noClasses()
            .should().accessTargetWhere(WEAK_RANDOMNESS)
            .because("a code, symbol, secret or draw the site makes must not be predictable: java.util.Random and the JDK's other generators"
                    + " are seeded and linear, so only SecureRandom, or a RandomGenerator a SecureRandom is handed in as, may draw (#621, round 5)");

    @ArchTest
    static final ArchRule a_secure_random_is_specialised_only_to_derive_the_receipt_key = classes()
            .that().areAssignableTo(SecureRandom.class).or().areAssignableTo(SecureRandomSpi.class)
            .should().haveFullyQualifiedName(SEED_RANDOM)
            .because("a subclass of SecureRandom passes for one and can draw nothing random: only the receipt signer's SeedRandom hands"
                    + " the Ed25519 seed to the JCA key pair generator, a key derivation, not a draw (#621, round 5)");

    @Test
    @DisplayName("Given the receipt signer, when it is read, then it declares the one SecureRandom subclass the rule allows, so the rule names no class that is gone")
    void should_find_the_allowed_secure_random_when_read_given_the_receipt_signer() throws ClassNotFoundException {
        assertThat(Class.forName(SEED_RANDOM)).isAssignableTo(SecureRandom.class);
    }

    private static boolean usesWeakRandomness(JavaAccess<?> access) {
        if (!(access.getTarget() instanceof CodeUnitAccessTarget target)) {
            return false;
        }
        JavaClass owner = access.getTargetOwner();
        String name = target.getName();
        boolean construction = target instanceof ConstructorCallTarget || target instanceof ConstructorReferenceTarget;
        return owner.isEquivalentTo(Random.class)
                || construction && owner.isAssignableTo(RandomGenerator.class) && !owner.isEquivalentTo(SecureRandom.class)
                && !(owner.isAssignableTo(SecureRandom.class) && owner.getPackageName().startsWith(SITE))
                || owner.isAssignableTo(SecureRandom.class) && name.equals("setSeed")
                || owner.isEquivalentTo(SecureRandom.class) && construction && target.getRawParameterTypes().size() == 1
                && target.getRawParameterTypes().getFirst().isEquivalentTo(byte[].class)
                || WEAK_LIBRARY_GENERATORS.stream().anyMatch(generator -> owner.getName().equals(generator) || owner.getName().startsWith(generator + "$"))
                || owner.getName().equals(ARRAY_UTILS) && name.equals("shuffle") && target.getRawParameterTypes().size() == 1
                || WEAK_GENERATORS.stream().anyMatch(owner::isAssignableTo)
                || (owner.isEquivalentTo(Math.class) || owner.isEquivalentTo(StrictMath.class)) && name.equals("random")
                || owner.isAssignableTo(RandomGenerator.class) && !owner.isAssignableTo(SecureRandom.class) && GENERATOR_FACTORIES.contains(name)
                || owner.isEquivalentTo(Collections.class) && name.equals("shuffle") && target.getRawParameterTypes().size() == 1;
    }

    @Test
    @DisplayName("Given a planted class that draws from every weak generator by a call, a constructor and a method reference, when the rule checks it, then each is reported and SecureRandom, a handed-in generator and a shuffle with one are not, while every SecureRandom subclass is reported by the subclass rule")
    void should_report_every_weak_generator_when_checked_given_a_planted_class(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "org.planted.prng.FixedSecureRandom", """
                        package org.planted.prng;

                        import java.security.SecureRandom;

                        public class FixedSecureRandom extends SecureRandom {

                            @Override
                            public void nextBytes(byte[] bytes) {
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.PlantedSpi", """
                        package cz.novanadeje.app.planteda.infrastructure;

                        import java.security.SecureRandomSpi;

                        class PlantedSpi extends SecureRandomSpi {

                            @Override
                            protected void engineSetSeed(byte[] seed) {
                            }

                            @Override
                            protected void engineNextBytes(byte[] bytes) {
                            }

                            @Override
                            protected byte[] engineGenerateSeed(int numBytes) {
                                return new byte[numBytes];
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.domain.PlantedDraws", """
                        package cz.novanadeje.app.planteda.domain;

                        import java.security.SecureRandom;
                        import java.util.Collections;
                        import java.util.List;
                        import java.util.Random;
                        import java.util.SplittableRandom;
                        import java.util.concurrent.ThreadLocalRandom;
                        import java.util.function.DoubleSupplier;
                        import java.util.function.Supplier;
                        import java.util.random.RandomGenerator;
                        import java.util.random.RandomGeneratorFactory;
                        import org.apache.commons.lang3.ArrayUtils;
                        import org.apache.commons.lang3.RandomStringUtils;
                        import org.apache.commons.lang3.RandomUtils;
                        import org.apache.commons.text.RandomStringGenerator;

                        class PlantedDraws {

                            static final class SeededRandom extends Random {

                                SeededRandom() {
                                    super(42);
                                }
                            }

                            static final class StrongerRandom extends SecureRandom {

                                StrongerRandom() {
                                    super();
                                }
                            }

                            int seeded() {
                                return new SeededRandom().nextInt();
                            }

                            int plainRandom() {
                                return new Random().nextInt();
                            }

                            int givenRandom(Random random) {
                                return random.nextInt(10);
                            }

                            Supplier<Random> randomMaker() {
                                return Random::new;
                            }

                            int threadLocal() {
                                return ThreadLocalRandom.current().nextInt(10);
                            }

                            long splittable() {
                                return new SplittableRandom().nextLong();
                            }

                            double mathRandom() {
                                return Math.random();
                            }

                            double strictMathRandom() {
                                return StrictMath.random();
                            }

                            DoubleSupplier mathRandomReference() {
                                return Math::random;
                            }

                            RandomGenerator defaultGenerator() {
                                return RandomGenerator.getDefault();
                            }

                            RandomGenerator namedGenerator() {
                                return RandomGenerator.of("L64X128MixRandom");
                            }

                            RandomGenerator splittableGenerator() {
                                return RandomGenerator.SplittableGenerator.of("L64X128MixRandom");
                            }

                            RandomGenerator fromFactory() {
                                return RandomGeneratorFactory.of("Xoshiro256PlusPlus").create();
                            }

                            void shuffled(List<String> words) {
                                Collections.shuffle(words);
                            }

                            static final class FixedGenerator implements RandomGenerator {

                                @Override
                                public long nextLong() {
                                    return 4L;
                                }
                            }

                            RandomGenerator fixed() {
                                return new FixedGenerator();
                            }

                            int seededSecure(byte[] seed) {
                                SecureRandom random = new SecureRandom(seed);
                                random.setSeed(1L);
                                return random.nextInt(10);
                            }

                            String libraryString() {
                                return new RandomStringGenerator.Builder().withinRange('a', 'z').get().generate(8);
                            }

                            String insecureString() {
                                return RandomStringUtils.insecure().nextAlphanumeric(8);
                            }

                            int insecureInt() {
                                return RandomUtils.insecure().randomInt();
                            }

                            void shuffledArray(int[] values) {
                                ArrayUtils.shuffle(values);
                            }

                            void shuffledArrayWithSecureRandom(int[] values, SecureRandom random) {
                                ArrayUtils.shuffle(values, random);
                            }

                            SecureRandom anonymous() {
                                return new SecureRandom() {
                                    @Override
                                    public void nextBytes(byte[] bytes) {
                                    }
                                };
                            }

                            int library() {
                                return new org.planted.prng.FixedSecureRandom().nextInt(10);
                            }

                            int secure() {
                                return new SecureRandom().nextInt(10);
                            }

                            int stronger() {
                                return new StrongerRandom().nextInt(10);
                            }

                            int handedIn(RandomGenerator random) {
                                return random.nextInt(10);
                            }

                            void shuffledWithSecureRandom(List<String> words, SecureRandom random) {
                                Collections.shuffle(words, random);
                            }
                        }
                        """));

        assertThat(randomness_comes_only_from_secure_random.evaluate(planted).getFailureReport().getDetails())
                .hasSize(32)
                .anySatisfy(line -> assertThat(line).contains("SeededRandom.<init>()").contains("java.util.Random.<init>(long)"))
                .anySatisfy(line -> assertThat(line).contains("seeded()").contains("PlantedDraws$SeededRandom.<init>()"))
                .anySatisfy(line -> assertThat(line).contains("plainRandom()").contains("java.util.Random.<init>()"))
                .anySatisfy(line -> assertThat(line).contains("plainRandom()").contains("java.util.Random.nextInt()"))
                .anySatisfy(line -> assertThat(line).contains("givenRandom(java.util.Random)").contains("java.util.Random.nextInt(int)"))
                .anySatisfy(line -> assertThat(line).contains("randomMaker()").contains("java.util.Random.<init>()"))
                .anySatisfy(line -> assertThat(line).contains("threadLocal()").contains("ThreadLocalRandom.current()"))
                .anySatisfy(line -> assertThat(line).contains("threadLocal()").contains("ThreadLocalRandom.nextInt(int)"))
                .anySatisfy(line -> assertThat(line).contains("splittable()").contains("SplittableRandom.<init>()"))
                .anySatisfy(line -> assertThat(line).contains("splittable()").contains("SplittableRandom.nextLong()"))
                .anySatisfy(line -> assertThat(line).contains("mathRandom()").contains("java.lang.Math.random()"))
                .anySatisfy(line -> assertThat(line).contains("strictMathRandom()").contains("java.lang.StrictMath.random()"))
                .anySatisfy(line -> assertThat(line).contains("mathRandomReference()").contains("java.lang.Math.random()"))
                .anySatisfy(line -> assertThat(line).contains("defaultGenerator()").contains("RandomGenerator.getDefault()"))
                .anySatisfy(line -> assertThat(line).contains("namedGenerator()").contains("RandomGenerator.of("))
                .anySatisfy(line -> assertThat(line).contains("splittableGenerator()").contains("RandomGenerator$SplittableGenerator.of("))
                .anySatisfy(line -> assertThat(line).contains("fromFactory()").contains("RandomGeneratorFactory.of("))
                .anySatisfy(line -> assertThat(line).contains("fromFactory()").contains("RandomGeneratorFactory.create()"))
                .anySatisfy(line -> assertThat(line).contains("shuffled(java.util.List)").contains("Collections.shuffle(java.util.List)"))
                .anySatisfy(line -> assertThat(line).contains("fixed()").contains("PlantedDraws$FixedGenerator.<init>()"))
                .anySatisfy(line -> assertThat(line).contains("seededSecure([B)").contains("java.security.SecureRandom.<init>([B)"))
                .anySatisfy(line -> assertThat(line).contains("seededSecure([B)").contains("java.security.SecureRandom.setSeed(long)"))
                .anySatisfy(line -> assertThat(line).contains("libraryString()").contains("RandomStringGenerator$Builder.<init>()"))
                .anySatisfy(line -> assertThat(line).contains("libraryString()").contains("RandomStringGenerator$Builder.withinRange(int, int)"))
                .anySatisfy(line -> assertThat(line).contains("libraryString()").contains("RandomStringGenerator$Builder.get()"))
                .anySatisfy(line -> assertThat(line).contains("libraryString()").contains("RandomStringGenerator.generate(int)"))
                .anySatisfy(line -> assertThat(line).contains("insecureString()").contains("RandomStringUtils.insecure()"))
                .anySatisfy(line -> assertThat(line).contains("insecureString()").contains("RandomStringUtils.nextAlphanumeric(int)"))
                .anySatisfy(line -> assertThat(line).contains("insecureInt()").contains("RandomUtils.insecure()"))
                .anySatisfy(line -> assertThat(line).contains("insecureInt()").contains("RandomUtils.randomInt()"))
                .anySatisfy(line -> assertThat(line).contains("shuffledArray([I)").contains("ArrayUtils.shuffle([I)"))
                .anySatisfy(line -> assertThat(line).contains("library()").contains("org.planted.prng.FixedSecureRandom.<init>()"))
                .noneSatisfy(line -> assertThat(line).containsAnyOf("PlantedDraws.secure()", "PlantedDraws.stronger()", "StrongerRandom.<init>", "handedIn(", "shuffledWithSecureRandom(",
                        "shuffledArrayWithSecureRandom(", "anonymous()", "PlantedDraws$1.<init>"));
        assertThat(a_secure_random_is_specialised_only_to_derive_the_receipt_key.evaluate(planted).getFailureReport().getDetails())
                .hasSize(4)
                .anySatisfy(line -> assertThat(line).contains("PlantedDraws$StrongerRandom"))
                .anySatisfy(line -> assertThat(line).contains("PlantedSpi"))
                .anySatisfy(line -> assertThat(line).contains("org.planted.prng.FixedSecureRandom"))
                .anySatisfy(line -> assertThat(line).contains("PlantedDraws$1"));
    }
}
