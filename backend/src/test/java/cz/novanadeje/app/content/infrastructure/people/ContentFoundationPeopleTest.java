package cz.novanadeje.app.content.infrastructure.people;

import cz.novanadeje.app.content.domain.media.MediaId;
import cz.novanadeje.app.content.domain.media.MediaImage;
import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.media.MediaVariant;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonDetails;
import cz.novanadeje.app.content.domain.people.PersonEmails;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import cz.novanadeje.app.shared.application.people.FoundationPerson;
import cz.novanadeje.app.shared.application.people.PrintPortrait;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ContentFoundationPeopleTest {

    private static final Instant AT = Instant.parse("2026-10-31T08:00:00Z");
    private static final MediaId PORTRAIT = MediaId.newId(AT);
    private static final PersonId WITH_PORTRAIT = PersonId.newId(AT);
    private static final PersonId WITHOUT_PORTRAIT = PersonId.newId(AT.plusSeconds(1));

    private final PersonRepository people = mock(PersonRepository.class);
    private final MediaImageRepository media = mock(MediaImageRepository.class);
    private final ContentFoundationPeople foundationPeople = new ContentFoundationPeople(people, media);

    @Test
    @DisplayName("Given people with and without a portrait, when one is looked up, then their name and whether they have a portrait come back, and nobody for an unknown id")
    void should_answer_name_and_portrait_when_looked_up_given_people() {
        givenPeople();

        assertThat(foundationPeople.find(WITH_PORTRAIT.value())).contains(new FoundationPerson(WITH_PORTRAIT.value(), "Petr Vzorový", true));
        assertThat(foundationPeople.find(WITHOUT_PORTRAIT.value())).contains(new FoundationPerson(WITHOUT_PORTRAIT.value(), "Eva Ukázková", false));
        assertThat(foundationPeople.find(PersonId.newId(AT.plusSeconds(9)).value())).isEmpty();
    }

    @Test
    @DisplayName("Given a person stored with a line break in the name, when they are looked up, then they say their name must be corrected first")
    void should_say_name_needs_correcting_when_looked_up_given_a_stored_line_break() {
        givenPeople();
        PersonDetails stored = new PersonDetails("Eva\nUkázková", Optional.empty(), false, Optional.empty(), false, Optional.empty(), PersonEmails.NONE);
        when(people.findById(WITHOUT_PORTRAIT)).thenReturn(Optional.of(new Person(WITHOUT_PORTRAIT, stored, 0, Optional.empty(), AT, AT)));
        when(people.findByIdForUpdate(WITHOUT_PORTRAIT)).thenReturn(Optional.of(new Person(WITHOUT_PORTRAIT, stored, 0, Optional.empty(), AT, AT)));

        assertThat(foundationPeople.find(WITHOUT_PORTRAIT.value())).hasValueSatisfying(person -> assertThat(person.needsCorrection()).isTrue());
        assertThat(foundationPeople.findForUpdate(WITHOUT_PORTRAIT.value())).hasValueSatisfying(person -> assertThat(person.needsCorrection()).isTrue());
        assertThat(foundationPeople.find(WITH_PORTRAIT.value())).hasValueSatisfying(person -> assertThat(person.needsCorrection()).isFalse());
    }

    @Test
    @DisplayName("Given a person with a portrait in several sizes, when the portrait for print is asked for twice, then it is cut from the largest size once and the same bytes come back")
    void should_prepare_largest_variant_once_when_asked_twice_given_portrait() {
        givenPeople();
        when(media.findById(PORTRAIT)).thenReturn(Optional.of(new MediaImage(PORTRAIT, 1200, 800,
                List.of(variant(480, 320), variant(960, 640)), AT)));

        Optional<PrintPortrait> first = foundationPeople.printPortraitOf(WITH_PORTRAIT.value());
        Optional<PrintPortrait> second = foundationPeople.printPortraitOf(WITH_PORTRAIT.value());

        assertThat(first).isPresent();
        assertThat(second).isEqualTo(first);
        assertThat(decoded(first.get()).getWidth()).isEqualTo(PrintPortrait.SIDE);
        verify(media, times(1)).findById(PORTRAIT);
    }

    @Test
    @DisplayName("Given a person without a portrait, an unknown person or a portrait whose image is gone, when the portrait for print is asked for, then there is none")
    void should_answer_none_when_asked_given_no_portrait() {
        givenPeople();
        when(media.findById(PORTRAIT)).thenReturn(Optional.empty());

        assertThat(foundationPeople.printPortraitOf(WITHOUT_PORTRAIT.value())).isEmpty();
        assertThat(foundationPeople.printPortraitOf(PersonId.newId(AT.plusSeconds(9)).value())).isEmpty();
        assertThat(foundationPeople.printPortraitOf(WITH_PORTRAIT.value())).isEmpty();
    }

    @Test
    @DisplayName("Given a person of the foundation, when they are looked up for an update, then the lookup locks their row and an unknown id finds nobody")
    void should_read_with_lock_when_looked_up_for_update_given_person() {
        when(people.findByIdForUpdate(WITH_PORTRAIT)).thenReturn(Optional.of(person(WITH_PORTRAIT, "Petr Vzorový", Optional.of(PORTRAIT))));

        assertThat(foundationPeople.findForUpdate(WITH_PORTRAIT.value())).contains(new FoundationPerson(WITH_PORTRAIT.value(), "Petr Vzorový", true));
        assertThat(foundationPeople.findForUpdate(WITHOUT_PORTRAIT.value())).isEmpty();
        verify(people, never()).findById(any());
    }

    @Test
    @DisplayName("Given a portrait asked for by two receipts at once, when both wait for it, then it is prepared once and both get the same bytes")
    void should_prepare_once_when_asked_at_once_given_two_receipts() throws Exception {
        givenPeople();
        CountDownLatch loading = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger loads = new AtomicInteger();
        MediaImage image = new MediaImage(PORTRAIT, 1200, 800, List.of(variant(960, 640)), AT);
        when(media.findById(PORTRAIT)).thenAnswer(call -> {
            loads.incrementAndGet();
            loading.countDown();
            release.await(5, TimeUnit.SECONDS);
            return Optional.of(image);
        });
        FutureTask<Optional<PrintPortrait>> first = new FutureTask<>(() -> foundationPeople.printPortraitOf(WITH_PORTRAIT.value()));
        FutureTask<Optional<PrintPortrait>> second = new FutureTask<>(() -> foundationPeople.printPortraitOf(WITH_PORTRAIT.value()));
        Thread.ofPlatform().start(first);
        assertThat(loading.await(5, TimeUnit.SECONDS)).isTrue();
        Thread waiting = Thread.ofPlatform().start(second);
        await().until(() -> waiting.getState() != Thread.State.RUNNABLE && waiting.getState() != Thread.State.NEW);
        release.countDown();

        assertThat(first.get(5, TimeUnit.SECONDS)).isPresent();
        assertThat(second.get(5, TimeUnit.SECONDS)).isEqualTo(first.get());
        assertThat(loads).hasValue(1);
    }

    @Test
    @DisplayName("Given more portraits asked for than are kept, when each is prepared, then only a few prepared portraits stay in memory")
    void should_keep_few_when_prepared_given_many_portraits() {
        for (int index = 0; index < 12; index++) {
            MediaId portrait = MediaId.newId(AT.plusSeconds(100 + index));
            PersonId person = PersonId.newId(AT.plusSeconds(200 + index));
            when(people.findById(person)).thenReturn(Optional.of(person(person, "Petr Vzorový", Optional.of(portrait))));
            when(media.findById(portrait)).thenReturn(Optional.of(new MediaImage(portrait, 64, 64, List.of(variant(64, 64)), AT)));

            assertThat(foundationPeople.printPortraitOf(person.value())).isPresent();
        }

        assertThat(foundationPeople.portraitsKept()).isLessThanOrEqualTo(4);
    }

    @Test
    @DisplayName("Given a portrait whose stored image cannot be decoded, when the portrait for print is asked for, then there is none and a warning names only the image id")
    void should_answer_none_and_warn_when_asked_given_undecodable_portrait() {
        givenPeople();
        when(media.findById(PORTRAIT)).thenReturn(Optional.of(new MediaImage(PORTRAIT, 1200, 800,
                List.of(new MediaVariant(1200, 800, new byte[] {1, 2, 3, 4})), AT)));
        ListAppender<ILoggingEvent> log = new ListAppender<>();
        log.start();
        Logger logger = (Logger) LoggerFactory.getLogger(ContentFoundationPeople.class);
        logger.addAppender(log);
        try {
            assertThat(foundationPeople.printPortraitOf(WITH_PORTRAIT.value())).isEmpty();
        } finally {
            logger.detachAppender(log);
        }

        assertThat(log.list).singleElement().satisfies(event -> {
            assertThat(event.getLevel()).isEqualTo(Level.WARN);
            assertThat(event.getFormattedMessage())
                    .isEqualTo("Portrait " + PORTRAIT.value() + " cannot be prepared for print, the receipt is issued without it")
                    .doesNotContain("Petr");
            assertThat(event.getThrowableProxy()).isNull();
        });
    }

    private void givenPeople() {
        when(people.findById(WITH_PORTRAIT)).thenReturn(Optional.of(person(WITH_PORTRAIT, "Petr Vzorový", Optional.of(PORTRAIT))));
        when(people.findById(WITHOUT_PORTRAIT)).thenReturn(Optional.of(person(WITHOUT_PORTRAIT, "Eva Ukázková", Optional.empty())));
    }

    private static Person person(PersonId id, String name, Optional<MediaId> portrait) {
        return Person.add(id, new PersonDetails(name, Optional.of("předseda správní rady"), true, Optional.empty(), true, portrait,
                PersonEmails.NONE), 0, AT);
    }

    private static MediaVariant variant(int width, int height) {
        try {
            ByteArrayOutputStream webp = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "webp", webp);
            return new MediaVariant(width, height, webp.toByteArray());
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }

    private static BufferedImage decoded(PrintPortrait portrait) {
        try {
            return ImageIO.read(new ByteArrayInputStream(portrait.jpeg()));
        } catch (IOException failure) {
            throw new UncheckedIOException(failure);
        }
    }
}
