package cz.novanadeje.app.content.application.news;

import cz.novanadeje.app.content.domain.media.MediaImageRepository;
import cz.novanadeje.app.content.domain.news.NewsArticle;
import cz.novanadeje.app.content.domain.people.Person;
import cz.novanadeje.app.content.domain.people.PersonId;
import cz.novanadeje.app.content.domain.people.PersonNotFound;
import cz.novanadeje.app.content.domain.people.PersonRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class NewsSigners {

    private final PersonRepository people;
    private final MediaImageRepository media;

    public NewsSigners(PersonRepository people, MediaImageRepository media) {
        this.people = people;
        this.media = media;
    }

    public List<NewsArticleView> views(List<NewsArticle> articles, LocalDate today) {
        Map<PersonId, NewsSignerView> signers = signersOf(articles);
        return articles.stream().map(article -> NewsArticleView.from(article, today, article.content().signer().map(signers::get))).toList();
    }

    public NewsArticleView view(NewsArticle article, LocalDate today) {
        return views(List.of(article), today).getFirst();
    }

    void requireExisting(Optional<PersonId> signer) {
        signer.filter(id -> people.findById(id).isEmpty()).ifPresent(id -> {
            throw new PersonNotFound(id);
        });
    }

    private Map<PersonId, NewsSignerView> signersOf(List<NewsArticle> articles) {
        Set<PersonId> wanted = articles.stream().flatMap(article -> article.content().signer().stream()).collect(Collectors.toSet());
        if (wanted.isEmpty()) {
            return Map.of();
        }
        return people.findAllInOrder().stream().filter(person -> wanted.contains(person.id()))
                .collect(Collectors.toMap(Person::id, person -> NewsSignerView.of(person, media)));
    }
}
