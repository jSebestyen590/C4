import { SimpleGrid, type SimpleGridProps } from '@mantine/core';
import classes from './FeldZeile.module.css';

/**
 * A row (grid) of form fields in which error texts take no layout space: they stand under their
 * input in room reserved per cell, so inputs stay aligned on the bottom of the tallest label and
 * neither the field nor its neighbours move when an error appears. Children are the cells; a cell
 * may be an input or any block (it then gets the same reserved room, so the row stays aligned).
 */
export function FeldZeile({ className, ...rest }: Readonly<SimpleGridProps>) {
  return <SimpleGrid {...rest} className={[classes.zeile, className].filter(Boolean).join(' ')} />;
}

/** Class for a container whose inputs only show a red border (no error text), e.g. table cells. */
export const NUR_RAND_KLASSE = classes.nurRand;
