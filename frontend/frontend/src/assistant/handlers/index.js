import { INTENTS } from '../intentEngine.js';
import { handleSosIntent } from './sosHandler.js';
import { handleVolunteerIntent } from './volunteerHandler.js';
import { handleLiveAssistIntent } from './liveAssistHandler.js';
import {
  handleNavigationIntent,
  handleNavHowFarIntent,
  handleNavRepeatIntent,
  handleNavStopIntent,
} from './navigationHandler.js';
import { handleBusInfoIntent } from './busHandler.js';
import { handleNearestBusStopIntent } from './nearestBusStopHandler.js';
import { handleFamilyIntent } from './familyHandler.js';
import { handleWhereAmIIntent, handleWhatIsAheadIntent } from './locationHandler.js';
import { handleControlOrConfirmationIntent } from './controlHandler.js';

export const INTENT_HANDLERS = {
  [INTENTS.EMERGENCY_SOS]: handleSosIntent,
  [INTENTS.VOLUNTEER_ASSISTANCE]: handleVolunteerIntent,
  [INTENTS.LIVE_ASSIST]: handleLiveAssistIntent,
  [INTENTS.WHAT_IS_AHEAD]: handleWhatIsAheadIntent,
  [INTENTS.NAVIGATION]: handleNavigationIntent,
  [INTENTS.NAV_HOW_FAR]: handleNavHowFarIntent,
  [INTENTS.NAV_REPEAT]: handleNavRepeatIntent,
  [INTENTS.NAV_STOP]: handleNavStopIntent,
  [INTENTS.NEAREST_BUS_STOP]: handleNearestBusStopIntent,
  [INTENTS.BUS_INFO]: handleBusInfoIntent,
  [INTENTS.CALL_FAMILY]: handleFamilyIntent,
  [INTENTS.SEND_LOCATION]: handleFamilyIntent,
  [INTENTS.WHERE_AM_I]: handleWhereAmIIntent,
  [INTENTS.CANCEL]: handleControlOrConfirmationIntent,
  [INTENTS.STOP_SPEECH]: handleControlOrConfirmationIntent,
  [INTENTS.REPEAT]: handleControlOrConfirmationIntent,
  [INTENTS.HELP]: handleControlOrConfirmationIntent,
  [INTENTS.CONFIRM_YES]: handleControlOrConfirmationIntent,
  [INTENTS.CONFIRM_NO]: handleControlOrConfirmationIntent,
  [INTENTS.CONFIRM_OPTION]: handleControlOrConfirmationIntent,
  [INTENTS.SET_LANGUAGE]: handleControlOrConfirmationIntent,
  [INTENTS.UNKNOWN]: handleControlOrConfirmationIntent,
};

export async function dispatchIntent(parsed, ctx, options = {}) {
  const handler = INTENT_HANDLERS[parsed?.intent] || INTENT_HANDLERS[INTENTS.UNKNOWN];
  return handler(parsed, ctx, options);
}

