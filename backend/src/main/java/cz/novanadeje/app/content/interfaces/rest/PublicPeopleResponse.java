package cz.novanadeje.app.content.interfaces.rest;

import cz.novanadeje.app.content.application.people.BoardMemberView;
import cz.novanadeje.app.content.application.people.FeaturedPersonView;
import cz.novanadeje.app.content.application.people.FoundersNoteView;
import cz.novanadeje.app.content.application.people.PublicPeopleView;
import cz.novanadeje.app.content.application.people.SignatureView;

import java.util.List;

public record PublicPeopleResponse(List<Card> featured, List<BoardMember> board, Note note, String footnote) {

    static PublicPeopleResponse from(PublicPeopleView view) {
        return new PublicPeopleResponse(view.featured().stream().map(Card::from).toList(), view.board().stream().map(BoardMember::from).toList(),
                view.note().map(Note::from).orElse(null), view.footnote().orElse(null));
    }

    public record Card(String name, String role, PersonImageResponse portrait) {

        static Card from(FeaturedPersonView view) {
            return new Card(view.name(), view.role().orElse(null), view.portrait().map(PersonImageResponse::from).orElse(null));
        }
    }

    public record BoardMember(String name, String note) {

        static BoardMember from(BoardMemberView view) {
            return new BoardMember(view.name(), view.note().orElse(null));
        }
    }

    public record Note(String text, List<Signature> signatures) {

        static Note from(FoundersNoteView view) {
            return new Note(view.text(), view.signatures().stream().map(Signature::from).toList());
        }
    }

    public record Signature(String url, int width, int height, String name) {

        static Signature from(SignatureView view) {
            return new Signature(MediaUrls.of(view.image().id()), view.image().width(), view.image().height(), view.name());
        }
    }
}
