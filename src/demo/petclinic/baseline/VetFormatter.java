package org.springframework.samples.petclinic.owner;

import java.text.ParseException;
import java.util.Locale;
import java.util.Objects;
import org.springframework.format.Formatter;
import org.springframework.stereotype.Component;
import org.springframework.samples.petclinic.vet.Vet;
import org.springframework.samples.petclinic.vet.VetRepository;

@Component
public class VetFormatter implements Formatter<Vet> {
    private final VetRepository vets;

    public VetFormatter(VetRepository vets) {
        this.vets = vets;
    }

    @Override
    public Vet parse(String text, Locale locale) throws ParseException {
        final Integer id;
        try {
            id = Integer.valueOf(text);
        }
        catch (NumberFormatException ex) {
            throw new ParseException("Invalid vet id: " + text, 0);
        }
        return this.vets.findAll().stream()
            .filter(vet -> Objects.equals(vet.getId(), id))
            .findFirst()
            .orElseThrow(() -> new ParseException("Vet not found: " + text, 0));
    }

    @Override
    public String print(Vet vet, Locale locale) {
        return String.valueOf(vet.getId());
    }
}
