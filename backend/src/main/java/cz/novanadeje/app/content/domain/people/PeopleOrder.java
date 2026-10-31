package cz.novanadeje.app.content.domain.people;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

public final class PeopleOrder {

    private PeopleOrder() {
    }

    public static List<Person> apply(List<Person> people, List<PersonId> order, Instant at) {
        Map<PersonId, Person> byId = people.stream().collect(Collectors.toMap(Person::id, Function.identity()));
        if (order.size() != people.size() || !new HashSet<>(order).equals(byId.keySet())) {
            throw new PeopleOrderMismatch();
        }
        return IntStream.range(0, order.size()).mapToObj(position -> byId.get(order.get(position)).placeAt(position, at)).toList();
    }
}
