-- Cell, Block, Security Level and Sentence Details are gone from the inmate
-- record: the fields were only ever carried as free text / JSONB keys, plus
-- the cell_id / block_id foreign key columns that fed them. Strip both so the
-- dropped fields cannot resurface through the column-folding read path.
UPDATE inmates
   SET data = data - 'cellId' - 'blockId' - 'cellBlock' - 'cellNumber'
              - 'cellName' - 'blockName' - 'securityLevel'
              - 'sentenceDetails' - 'sentenceStart' - 'sentenceEnd',
       cell_id = NULL,
       block_id = NULL;
