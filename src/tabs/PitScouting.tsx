import React, { useState, useEffect } from 'react';
import { storage } from '../lib/storage';
import { PitScoutData, ClimbLevel, DriveTrainType, DriveMotor, IntakePosition, ShooterType } from '../types';
import { Stepper } from '../components/Stepper';
import { Toggle, MultiToggle } from '../components/Toggle';
import { showToast } from '../components/Toast';
import { Save } from 'lucide-react';

const INITIAL_STATE: PitScoutData = {
  teamNumber: '',
  canClimbTower: false,
  fuelHopperCapacity: '',
  chassisWidth: '',
  chassisLength: '',
  driveTrainType: '',
  driveMotors: [],
  canDriveOverBump: false,
  canDriveUnderTrench: false,
  intakePosition: '',
  looksGood: '',
  autoDescription: '',
  visionSetup: '',
  shooterType: '',
  hasTurret: false,
  canPlayDefense: false,
  notes: ''
};

export function PitScouting() {
  const [data, setData] = useState<PitScoutData>(INITIAL_STATE);

  useEffect(() => {
    if (data.teamNumber) {
      const saved = storage.get<any>(`pitScout:${data.teamNumber}`);
      if (saved && saved.data) {
        setData(saved.data);
      }
    }
  }, [data.teamNumber]);

  const updateField = <K extends keyof PitScoutData>(field: K, value: PitScoutData[K]) => {
    const newData = { ...data, [field]: value };
    setData(newData);
    if (newData.teamNumber) {
      storage.saveRecord('pitScout', `pitScout:${newData.teamNumber}`, newData);
    }
  };

  const handleMotorToggle = (motor: DriveMotor) => {
    const newMotors = data.driveMotors.includes(motor)
      ? data.driveMotors.filter(m => m !== motor)
      : [...data.driveMotors, motor];
    updateField('driveMotors', newMotors);
  };

  const handleSave = () => {
    if (!data.teamNumber) {
      showToast('Please enter a team number');
      return;
    }
    // Data is already auto-saved to storage on every change.
    // Just reset the form for the next entry.
    setData(INITIAL_STATE);
    showToast(`Saved pit scouting for team ${data.teamNumber}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-24">
      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white mb-4">Robot Details</h2>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Team Number</label>
          <input
            type="number"
            value={data.teamNumber}
            onChange={(e) => updateField('teamNumber', e.target.value ? parseInt(e.target.value) : '')}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono text-xl"
            placeholder="e.g. 254"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Chassis Width (in)</label>
            <input
              type="number"
              value={data.chassisWidth}
              onChange={(e) => updateField('chassisWidth', e.target.value ? parseFloat(e.target.value) : '')}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Chassis Length (in)</label>
            <input
              type="number"
              value={data.chassisLength}
              onChange={(e) => updateField('chassisLength', e.target.value ? parseFloat(e.target.value) : '')}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <MultiToggle
          label="Drive Train Type"
          options={['Tank', 'Swerve', 'Mecanum', 'H-Drive', 'Other']}
          value={data.driveTrainType}
          onChange={(v) => updateField('driveTrainType', v)}
        />
        
        {data.driveTrainType === 'Other' && (
          <input
            type="text"
            value={data.driveTrainOther || ''}
            onChange={(e) => updateField('driveTrainOther', e.target.value)}
            placeholder="Specify drive train..."
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500"
          />
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Drive Motors</label>
          <div className="grid grid-cols-2 gap-2">
            {(['Falcon 500 / Kraken X60', 'NEO', 'NEO Vortex', 'CIM', 'MiniCIM', 'Other'] as DriveMotor[]).map(motor => (
              <button
                key={motor}
                onClick={() => handleMotorToggle(motor)}
                className={`p-3 text-sm font-medium rounded-xl border transition-colors ${
                  data.driveMotors.includes(motor)
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {motor}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white mb-4">Game Mechanisms</h2>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Fuel Hopper Capacity</label>
          <input
            type="number"
            value={data.fuelHopperCapacity}
            onChange={(e) => updateField('fuelHopperCapacity', e.target.value ? parseInt(e.target.value) : '')}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <MultiToggle
          label="Intake Position"
          options={['Over the bumper', 'Under the bumper', 'Both']}
          value={data.intakePosition}
          onChange={(v) => updateField('intakePosition', v)}
        />

        <MultiToggle
          label="Shooter Type"
          options={['Single shooter', 'Multi-shooter']}
          value={data.shooterType}
          onChange={(v) => updateField('shooterType', v)}
        />

        <Toggle label="Has Turret?" value={data.hasTurret} onChange={(v) => updateField('hasTurret', v)} />

        <div className="space-y-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300">Field Traversal</h3>
          <Toggle label="Can drive over Bump (~6.5in)" value={data.canDriveOverBump} onChange={(v) => updateField('canDriveOverBump', v)} />
          <Toggle label="Can drive under Trench (~40in)" value={data.canDriveUnderTrench} onChange={(v) => updateField('canDriveUnderTrench', v)} />
        </div>

        <div className="space-y-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
          <Toggle label="Can climb Tower?" value={data.canClimbTower} onChange={(v) => updateField('canClimbTower', v)} />
          {data.canClimbTower && (
            <MultiToggle
              label="Maximum Climb Level"
              options={['Level 1', 'Level 2', 'Level 3']}
              value={data.maxClimbLevel || ''}
              onChange={(v) => updateField('maxClimbLevel', v)}
            />
          )}
        </div>
      </div>

      <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl space-y-6">
        <h2 className="text-2xl font-bold text-white mb-4">Strategy & Notes</h2>

        <Toggle label="Defense Capability?" value={data.canPlayDefense} onChange={(v) => updateField('canPlayDefense', v)} />
        {data.canPlayDefense && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">Defense Style</label>
            <textarea
              value={data.defenseStyle || ''}
              onChange={(e) => updateField('defenseStyle', e.target.value)}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[80px]"
            />
          </div>
        )}

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Autonomous Description</label>
          <textarea
            value={data.autoDescription}
            onChange={(e) => updateField('autoDescription', e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Vision Setup</label>
          <textarea
            value={data.visionSetup}
            onChange={(e) => updateField('visionSetup', e.target.value)}
            placeholder="e.g. Limelight 3G, PhotonVision, AprilTag pipelines..."
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[80px]"
          />
        </div>

        <MultiToggle
          label="Does it look good?"
          options={['Yes', 'No', 'Mid']}
          value={data.looksGood}
          onChange={(v) => updateField('looksGood', v)}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-300">Additional Notes</label>
          <textarea
            value={data.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white focus:ring-2 focus:ring-blue-500 min-h-[120px]"
          />
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-emerald-600/20 w-full sm:w-auto justify-center text-lg"
        >
          <Save className="w-6 h-6" />
          Save & Next
        </button>
      </div>
    </div>
  );
}
