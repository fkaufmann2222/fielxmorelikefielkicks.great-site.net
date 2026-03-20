import { MatchScoutData, EndGameClimbResult, AutoClimbResult } from '../types';

export const scoring = {
  getTowerPoints(endGameResult: EndGameClimbResult | '', autoResult?: AutoClimbResult): number {
    let points = 0;
    
    if (autoResult === 'Level 1 Successful') {
      points += 15;
    }

    switch (endGameResult) {
      case 'Level 1':
        points += 10;
        break;
      case 'Level 2':
        points += 20;
        break;
      case 'Level 3':
        points += 30;
        break;
    }

    return points;
  },

  getFuelPoints(autoFuel: number, teleopFuel: number): number {
    return autoFuel + teleopFuel;
  }
};
