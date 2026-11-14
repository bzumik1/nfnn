package cz.novanadeje.app.architecture;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import cz.novanadeje.app.AppApplication;
import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static org.assertj.core.api.Assertions.assertThat;

@AnalyzeClasses(
        packagesOf = AppApplication.class,
        importOptions = ImportOption.DoNotIncludeTests.class
)
class LiveFeedRulesTest {

    private static final Pattern FEEDS_CLASS = Pattern.compile("^cz\\.novanadeje\\.app\\.[^.]+\\.infrastructure\\.events\\.[A-Za-z]+LiveFeeds$");

    @ArchTest
    static final ArchRule live_feeds_are_constants_of_a_feeds_class = classes()
            .should(constructLiveFeedsOnlyAsConstantsOfAFeedsClass())
            .because("backend.md, Contexts and layers: a live feed's wire name and audience are fixed in one place per context "
                    + "(<context>/infrastructure/events/<Context>LiveFeeds), so no code builds a feed from data or gives a name a second audience");

    @ArchTest
    static void every_feed_name_has_one_audience(JavaClasses classes) {
        assertThat(namesWithMoreThanOneAudience(feedsOf(classes)))
                .as("a wire name reaches one audience only, whatever context defines it")
                .isEmpty();
    }

    @Test
    @DisplayName("Given planted feeds built as constants of a feeds class, in a method of a feeds class, in another class and in a feeds class outside infrastructure events, when the rule checks them, then only the constants of the feeds class are not reported")
    void should_report_every_feed_built_outside_a_feeds_class_constant_when_checked_given_planted_classes(@TempDir Path folder) throws IOException {
        JavaClasses planted = PlantedClasses.compiled(folder, Map.of(
                "cz.novanadeje.app.planteda.infrastructure.events.PlantedLiveFeeds", """
                        package cz.novanadeje.app.planteda.infrastructure.events;

                        import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;

                        public final class PlantedLiveFeeds {

                            public static final LiveFeed GIFTS = new LiveFeed("gifts", LiveFeed.Audience.DONOR);

                            static LiveFeed later(String name) {
                                return new LiveFeed(name, LiveFeed.Audience.EVERYONE);
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.infrastructure.persistence.PlantedAdapter", """
                        package cz.novanadeje.app.planteda.infrastructure.persistence;

                        import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;

                        class PlantedAdapter {

                            LiveFeed payments() {
                                return new LiveFeed("payments", LiveFeed.Audience.EVERYONE);
                            }
                        }
                        """,
                "cz.novanadeje.app.planteda.application.OtherLiveFeeds", """
                        package cz.novanadeje.app.planteda.application;

                        import cz.novanadeje.app.shared.application.event.StoredDataChanged.LiveFeed;

                        public final class OtherLiveFeeds {

                            public static final LiveFeed NEWS = new LiveFeed("news", LiveFeed.Audience.EVERYONE);
                        }
                        """));

        assertThat(live_feeds_are_constants_of_a_feeds_class.evaluate(planted).getFailureReport().getDetails())
                .hasSize(3)
                .anySatisfy(detail -> assertThat(detail).contains("PlantedLiveFeeds.later"))
                .anySatisfy(detail -> assertThat(detail).contains("PlantedAdapter.payments"))
                .anySatisfy(detail -> assertThat(detail).contains("OtherLiveFeeds.<clinit>"));
    }

    @Test
    @DisplayName("Given feeds of two contexts naming one wire name with two audiences and another with one, when the names are checked, then only the name with two audiences is reported")
    void should_report_a_name_with_two_audiences_when_checked_given_feeds_of_two_contexts() {
        List<LiveFeed> feeds = List.of(
                new LiveFeed("payments", LiveFeed.Audience.ADMINISTRATION),
                new LiveFeed("payments", LiveFeed.Audience.EVERYONE),
                new LiveFeed("donations", LiveFeed.Audience.DONOR),
                new LiveFeed("donations", LiveFeed.Audience.DONOR));

        assertThat(namesWithMoreThanOneAudience(feeds)).containsOnlyKeys("payments");
    }

    private static ArchCondition<JavaClass> constructLiveFeedsOnlyAsConstantsOfAFeedsClass() {
        return new ArchCondition<>("build a live feed only as a constant of <context>/infrastructure/events/<Context>LiveFeeds") {
            @Override
            public void check(JavaClass type, ConditionEvents events) {
                for (JavaConstructorCall call : type.getConstructorCallsFromSelf()) {
                    if (!call.getTargetOwner().isEquivalentTo(LiveFeed.class)) {
                        continue;
                    }
                    boolean constant = FEEDS_CLASS.matcher(type.getName()).matches() && call.getOrigin().getName().equals("<clinit>");
                    events.add(new SimpleConditionEvent(call, constant, call.getDescription()));
                }
            }
        };
    }

    private static List<LiveFeed> feedsOf(JavaClasses classes) {
        List<LiveFeed> feeds = new ArrayList<>();
        for (JavaClass type : classes) {
            for (JavaField field : type.getFields()) {
                if (field.getRawType().isEquivalentTo(LiveFeed.class) && field.getModifiers().contains(JavaModifier.STATIC)) {
                    feeds.add(valueOf(field));
                }
            }
        }
        return feeds;
    }

    private static LiveFeed valueOf(JavaField field) {
        try {
            java.lang.reflect.Field reflected = field.reflect();
            reflected.setAccessible(true);
            return (LiveFeed) reflected.get(null);
        } catch (IllegalAccessException unreadable) {
            throw new IllegalStateException("A live feed constant cannot be read: " + field.getFullName(), unreadable);
        }
    }

    private static Map<String, List<LiveFeed.Audience>> namesWithMoreThanOneAudience(List<LiveFeed> feeds) {
        Map<String, List<LiveFeed.Audience>> audiencesByName = new TreeMap<>();
        for (LiveFeed feed : feeds) {
            List<LiveFeed.Audience> audiences = audiencesByName.computeIfAbsent(feed.name(), name -> new ArrayList<>());
            if (!audiences.contains(feed.audience())) {
                audiences.add(feed.audience());
            }
        }
        audiencesByName.values().removeIf(audiences -> audiences.size() < 2);
        return audiencesByName;
    }
}
