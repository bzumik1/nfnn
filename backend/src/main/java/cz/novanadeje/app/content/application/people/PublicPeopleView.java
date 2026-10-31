package cz.novanadeje.app.content.application.people;

import java.util.List;
import java.util.Optional;

public record PublicPeopleView(List<FeaturedPersonView> featured, List<BoardMemberView> board, Optional<FoundersNoteView> note) {

    public PublicPeopleView {
        if (note == null) {
            throw new IllegalArgumentException("The public people carry their note even when absent");
        }
        featured = List.copyOf(featured);
        board = List.copyOf(board);
    }
}
