import { spawn } from 'node:child_process';
import { SAFARI_POSES } from './poses';
import { pickSimulator, type Simulator } from './webdriver';

function bootAndWait(simulator: Simulator): Promise<void> {
  return new Promise((done, failed) => {
    const boot = spawn('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'], {
      stdio: 'ignore',
    });
    boot.on('error', failed);
    boot.on('exit', (code) =>
      code === 0 ? done() : failed(new Error(`simctl bootstatus exited with ${code}`)),
    );
  });
}

function simulatorOf(pattern: RegExp): Simulator[] {
  try {
    return [pickSimulator(pattern)];
  } catch (error) {
    console.warn(`${String(error)}; its pose reports it`);
    return [];
  }
}

function simulatorsOfThePoses(): Simulator[] {
  const picked = SAFARI_POSES.flatMap((pose) =>
    pose.platform === 'iOS' && pose.devicePattern ? simulatorOf(pose.devicePattern) : [],
  );
  return [...new Map(picked.map((simulator) => [simulator.udid, simulator])).values()];
}

export default async function bootTheSimulatorsTogether(): Promise<void> {
  const simulators = simulatorsOfThePoses();
  const started = Date.now();
  const outcomes = await Promise.allSettled(simulators.map(bootAndWait));
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'rejected') {
      console.warn(
        `${simulators[index]?.name}: not booted ahead of its pose (${String(outcome.reason)}); its pose boots it`,
      );
    }
  });
  console.log(
    `Booted ${simulators.map((simulator) => simulator.name).join(', ')} together in ${Math.round((Date.now() - started) / 1000)} s`,
  );
}
