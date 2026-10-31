package cz.novanadeje.app.content.application.people;

import java.util.List;
import java.util.Optional;

public record PublicPeopleView(List<FeaturedPersonView> featured, List<BoardMemberView> board, Optional<FoundersNoteView> note,
                               Optional<String> footnote) {

    public PublicPeopleView {
        if (note == null || footnote == null) {
            throw new IllegalArgumentException("The public people carry their note and footnote even when absent");
        }
        featured = List.copyOf(featured);
        board = List.copyOf(board);
    }
}
