/*
 * Copyright 2012-2025 the original author or authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.springframework.samples.petclinic.owner;

import java.time.LocalTime;
import org.springframework.samples.petclinic.vet.VetScheduleRepository;
import java.util.Collection;
import java.util.List;
import java.util.stream.IntStream;
import org.springframework.samples.petclinic.vet.Vet;
import org.springframework.samples.petclinic.vet.VetRepository;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Controller;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

import jakarta.validation.Valid;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

/**
 * @author Juergen Hoeller
 * @author Ken Krebs
 * @author Arjen Poutsma
 * @author Michael Isvy
 * @author Dave Syer
 * @author Wick Dynex
 */
@Controller
class VisitController {

	private final OwnerRepository owners;

	private final VetRepository vets;

	private final VetScheduleRepository schedules;

	public VisitController(OwnerRepository owners, VetRepository vets, VetScheduleRepository schedules) {
		this.owners = owners;
		this.vets = vets;
		this.schedules = schedules;
	}

	@ModelAttribute("vets")
	public Collection<Vet> populateVets() {
		return this.vets.findAll();
	}

	@ModelAttribute("timeSlots")
	public List<LocalTime> populateTimeSlots() {
		return IntStream.rangeClosed(9, 18).mapToObj(hour -> LocalTime.of(hour, 0)).toList();
	}

	@InitBinder
	public void setAllowedFields(WebDataBinder dataBinder) {
		dataBinder.setDisallowedFields("id", "*.id");
	}

	/**
	 * Called before each and every @RequestMapping annotated method. 2 goals: - Make sure
	 * we always have fresh data - Since we do not use the session scope, make sure that
	 * Pet object always has an id (Even though id is not part of the form fields)
	 * @param petId
	 * @return Pet
	 */
	@ModelAttribute("visit")
	public Visit loadPetWithVisit(@PathVariable("ownerId") int ownerId, @PathVariable("petId") int petId,
			Map<String, Object> model) {
		Optional<Owner> optionalOwner = owners.findById(ownerId);
		Owner owner = optionalOwner.orElseThrow(() -> new IllegalArgumentException(
				"Owner not found with id: " + ownerId + ". Please ensure the ID is correct "));

		Pet pet = owner.getPet(petId);
		if (pet == null) {
			throw new IllegalArgumentException(
					"Pet with id " + petId + " not found for owner with id " + ownerId + ".");
		}
		model.put("pet", pet);
		model.put("owner", owner);

		Visit visit = new Visit();
		return visit;
	}

	// Spring MVC calls method loadPetWithVisit(...) before initNewVisitForm is
	// called
	@GetMapping("/owners/{ownerId}/pets/{petId}/visits/new")
	public String initNewVisitForm() {
		return "pets/createOrUpdateVisitForm";
	}

	// Spring MVC calls method loadPetWithVisit(...) before processNewVisitForm is
	// called
	@PostMapping("/owners/{ownerId}/pets/{petId}/visits/new")
	public String processNewVisitForm(@ModelAttribute Owner owner, @PathVariable int petId, @Valid Visit visit,
			BindingResult result, RedirectAttributes redirectAttributes) {
		if (visit.getVet() == null && !result.hasFieldErrors("vet")) {
			result.rejectValue("vet", "required", "Choose a vet.");
		}
		if (visit.getTime() == null && !result.hasFieldErrors("time")) {
			result.rejectValue("time", "required", "Choose a time.");
		}
		if (visit.getDate() == null && !result.hasFieldErrors("date")) {
			result.rejectValue("date", "required", "Choose a date.");
		}
		if (result.hasErrors()) {
			return "pets/createOrUpdateVisitForm";
		}

		// Validate this new booking only; never revalidate the pet's confirmed visits.
		boolean withinWorkingHours = this.schedules
			.findByVetIdAndWeekday(visit.getVet().getId(), visit.getDate().getDayOfWeek())
			.stream()
			.anyMatch(schedule -> !visit.getTime().isBefore(schedule.getStartTime())
				&& visit.getTime().isBefore(schedule.getEndTime()));
		if (!withinWorkingHours) {
			result.rejectValue("time", "outsideWorkingHours", "Selected time is outside the vet's working hours.");
			return "pets/createOrUpdateVisitForm";
		}

		owner.addVisit(petId, visit);
		this.owners.save(owner);
		redirectAttributes.addFlashAttribute("message", "Your visit has been booked");
		return "redirect:/owners/{ownerId}";
	}

}
