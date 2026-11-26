import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('consultations', (table) => {
      table.increments('id')
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
      table.integer('professional_id').unsigned().notNullable()
      table
        .foreign(['tenant_id', 'professional_id'])
        .references(['tenant_id', 'id'])
        .inTable('professionals')
      table.integer('revision').notNullable().defaultTo(0)
      table.string('external_id', 128).nullable()
      table.unique(['tenant_id', 'external_id'])
      table.string('patient_name').notNullable()
      table.string('patient_document', 32).nullable()
      table.string('patient_location').notNullable()
      table
        .enum('status', ['scheduled', 'waiting', 'in_progress', 'ended', 'cancelled'])
        .notNullable()
        .defaultTo('scheduled')
      table
        .enum('outcome', ['completed', 'referred_in_person', 'patient_declined', 'no_show'])
        .nullable()
      table.jsonb('professional_snapshot').nullable()
      table.jsonb('outcome_author').nullable()
      table.boolean('recording_allowed').notNullable().defaultTo(false)
      table.timestamp('scheduled_at', { useTz: true }).notNullable()
      table.timestamp('admitted_at', { useTz: true }).nullable()
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('ended_at', { useTz: true }).nullable()
      table.timestamp('doctor_joined_at', { useTz: true }).nullable()
      table.timestamp('patient_joined_at', { useTz: true }).nullable()
      table.timestamp('doctor_left_at', { useTz: true }).nullable()
      table.timestamp('patient_left_at', { useTz: true }).nullable()
      table.timestamp('retain_until', { useTz: true }).notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.index(['tenant_id', 'status'])
    })
    if (this.db.dialect.name === 'postgres') {
      this.schema.raw(`
        CREATE OR REPLACE FUNCTION protect_consultation_clinical_record() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            IF OLD.professional_snapshot IS NOT NULL OR OLD.outcome_author IS NOT NULL THEN
              RAISE EXCEPTION 'clinical record is immutable';
            END IF;
            RETURN OLD;
          END IF;
          IF TG_OP = 'UPDATE' THEN
            IF OLD.professional_snapshot IS NOT NULL AND (
              NEW.professional_snapshot IS DISTINCT FROM OLD.professional_snapshot OR
              NEW.professional_id IS DISTINCT FROM OLD.professional_id OR
              NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            ) THEN
              RAISE EXCEPTION 'professional snapshot is immutable';
            END IF;
            IF OLD.outcome_author IS NOT NULL AND (
              NEW.outcome_author IS DISTINCT FROM OLD.outcome_author OR
              NEW.outcome IS DISTINCT FROM OLD.outcome OR
              NEW.status IS DISTINCT FROM OLD.status OR
              NEW.ended_at IS DISTINCT FROM OLD.ended_at
            ) THEN
              RAISE EXCEPTION 'outcome attribution is immutable';
            END IF;
          END IF;
          IF NEW.professional_snapshot IS NOT NULL AND (
            jsonb_typeof(NEW.professional_snapshot) IS DISTINCT FROM 'object' OR
            NEW.professional_snapshot->>'professional_id' IS DISTINCT FROM NEW.professional_id::text
          ) THEN
            RAISE EXCEPTION 'professional snapshot does not match consultation';
          END IF;
          IF NEW.outcome_author IS NOT NULL THEN
            IF jsonb_typeof(NEW.outcome_author) IS DISTINCT FROM 'object' OR
               NEW.outcome_author->>'consultation_id' IS DISTINCT FROM NEW.id::text OR
               NEW.ended_at IS NULL OR NEW.status NOT IN ('ended', 'cancelled') THEN
              RAISE EXCEPTION 'invalid outcome attribution';
            END IF;
            IF NEW.outcome_author->>'kind' = 'doctor' THEN
              IF NEW.professional_snapshot IS NULL OR
                 NEW.outcome_author->'professional' IS DISTINCT FROM NEW.professional_snapshot OR
                 NEW.outcome_author->>'user_id' IS DISTINCT FROM NEW.professional_snapshot->>'user_id' OR
                 NEW.outcome IS NULL OR NEW.outcome NOT IN ('completed', 'referred_in_person', 'no_show') THEN
                RAISE EXCEPTION 'doctor outcome attribution does not match snapshot';
              END IF;
            ELSIF NEW.outcome_author->>'kind' IN ('patient', 'system') THEN
              IF NEW.outcome_author->'professional' IS DISTINCT FROM 'null'::jsonb OR
                 (NEW.outcome_author->>'kind' = 'patient' AND NEW.outcome IS DISTINCT FROM 'patient_declined') OR
                 (NEW.outcome_author->>'kind' = 'system' AND NEW.outcome IS NOT NULL) THEN
                RAISE EXCEPTION 'non-clinical outcome attribution is invalid';
              END IF;
            ELSE
              RAISE EXCEPTION 'unknown outcome author kind';
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `)
      this.schema.raw(`
        CREATE TRIGGER immutable_consultation_clinical_record
        BEFORE INSERT OR UPDATE OR DELETE ON consultations
        FOR EACH ROW EXECUTE FUNCTION protect_consultation_clinical_record()
      `)
    }
  }

  async down() {
    this.schema.dropTable('consultations')
    if (this.db.dialect.name === 'postgres') {
      this.schema.raw('DROP FUNCTION IF EXISTS protect_consultation_clinical_record()')
    }
  }
}
