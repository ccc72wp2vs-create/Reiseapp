import type { PhraseLang } from '../../../../shared/countries';
import type { PhraseBook } from '../types';
import { el } from './el';
import { es } from './es';
import { fr } from './fr';
import { hr } from './hr';
import { it } from './it';
import { pt } from './pt';
import { th } from './th';
import { tr } from './tr';

export const BOOKS: Record<PhraseLang, PhraseBook> = { th, es, it, fr, pt, el, tr, hr };
