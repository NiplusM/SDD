#!/usr/bin/env node
// Compile the exact on-screen fixtures against a supplied Spring PetClinic checkout.
// The checkout is read only; Maven runs in a temporary copy.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = path.resolve(process.argv[2] ?? path.join(root, '../spring-petclinic-sdd'));
const target = await fs.mkdtemp(path.join(os.tmpdir(), 'sdd-petclinic-audit-'));
await fs.copyFile(path.join(project, 'pom.xml'), path.join(target, 'pom.xml'));
await fs.cp(path.join(project, 'src'), path.join(target, 'src'), { recursive: true });

for (const layer of ['baseline', 'generated']) {
  const directory = path.join(root, 'src/demo/petclinic', layer);
  for (const file of await fs.readdir(directory)) {
    let relative;
    if (file.endsWith('.java')) {
      const sourceSet = file.endsWith('Tests.java') ? 'test' : 'main';
      const pkg = ['VetSchedule.java', 'VetScheduleRepository.java'].includes(file) ? 'vet' : 'owner';
      relative = `src/${sourceSet}/java/org/springframework/samples/petclinic/${pkg}/${file}`;
    } else if (file.endsWith('.sql')) {
      relative = `src/main/resources/db/h2/${file}`;
    } else {
      relative = `src/main/resources/templates/pets/${file}`;
    }
    const destination = path.join(target, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(path.join(directory, file), destination);
  }
}

console.log(`Testing displayed PetClinic code in ${target}`);
const result = spawnSync(process.env.MAVEN_BIN ?? 'mvn', [
  ...(process.env.MAVEN_OFFLINE === '1' ? ['-o'] : []),
  '-Dtest=VisitControllerTests', '-Dspring-javaformat.skip=true',
  '-Dcheckstyle.skip=true', '-Djacoco.skip=true', 'test',
], { cwd: target, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
console.log(`Audit files and reports: ${target}`);
process.exitCode = result.status ?? 1;
