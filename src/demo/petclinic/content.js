import baseline0 from './baseline/VetFormatter.java?raw';
import baseline1 from './baseline/Visit.java?raw';
import baseline2 from './baseline/VisitController.java?raw';
import baseline3 from './baseline/VisitControllerTests.java?raw';
import baseline4 from './baseline/createOrUpdateVisitForm.html?raw';
import baseline5 from './baseline/data.sql?raw';
import baseline6 from './baseline/schema.sql?raw';
export const PETCLINIC_BASELINE = {
  'VetFormatter.java': baseline0.trimEnd(),
  'Visit.java': baseline1.trimEnd(),
  'VisitController.java': baseline2.trimEnd(),
  'VisitControllerTests.java': baseline3.trimEnd(),
  'createOrUpdateVisitForm.html': baseline4.trimEnd(),
  'data.sql': baseline5.trimEnd(),
  'schema.sql': baseline6.trimEnd(),
};
import generated0 from './generated/VetSchedule.java?raw';
import generated1 from './generated/VetScheduleRepository.java?raw';
import generated2 from './generated/VisitController.java?raw';
import generated3 from './generated/VisitControllerTests.java?raw';
import generated4 from './generated/data.sql?raw';
import generated5 from './generated/schema.sql?raw';
export const PETCLINIC_GENERATED = {
  'VetSchedule.java': generated0.trimEnd(),
  'VetScheduleRepository.java': generated1.trimEnd(),
  'VisitController.java': generated2.trimEnd(),
  'VisitControllerTests.java': generated3.trimEnd(),
  'data.sql': generated4.trimEnd(),
  'schema.sql': generated5.trimEnd(),
};

// Before the policy decision, execution has not added the preservation regression.
export const PETCLINIC_FIRST_RUN = {
  'VisitController.java': PETCLINIC_GENERATED['VisitController.java'].replace(
    "\t\t// Validate this new booking only; never revalidate the pet's confirmed visits.\n", ''),
  'VisitControllerTests.java': PETCLINIC_GENERATED['VisitControllerTests.java'].replace(
    /    @Test\n    void preservesConfirmedAppointmentAfterScheduleChange[\s\S]*?(?=    private ResultActions book)/, ''),
};
