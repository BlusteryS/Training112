package com.training112.training;

import com.training112.auth.AuthRepository.Account;
import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.sqlclient.Pool;
import io.vertx.sqlclient.Tuple;
import java.util.UUID;

import static com.training112.training.TrainingRepository.forbidden;
import static com.training112.training.TrainingRepository.instructor;
import static com.training112.training.TrainingDb.list;

final class TrainingReports {
  private final Pool pool;

  TrainingReports(Pool pool) {
    this.pool = pool;
  }

  public Future<JsonArray> lessonReport(Account actor, UUID lesson) {
    instructor(actor);
    return list(pool, """
        SELECT jsonb_build_object(
          'learner_login', u.login,
          'mode', l.mode,
          'assignment_id', la.id,
          'attempt_id', a.id,
          'card_title',COALESCE(a.card_template->>'title',l.card_template->>'title',s.title),
          'attempt_status', a.status,
          'started_at', a.started_at,
          'finished_at', a.finished_at,
          'paused_ms', a.paused_ms,
          'elapsed_ms', CASE WHEN a.started_at IS NULL OR a.finished_at IS NULL THEN NULL ELSE
            GREATEST(0, (EXTRACT(EPOCH FROM (a.finished_at - a.started_at)) * 1000)::bigint - a.paused_ms) END,
          'card', a.card,
          'evaluation', CASE WHEN latest_review.result IS NULL AND a.status='failed' THEN NULL
            WHEN latest_review.result IS NULL THEN e.result
            ELSE COALESCE(e.result,'{}'::jsonb) || jsonb_build_object('score',latest_review.result->'score') END,
          'deadline_seconds', CASE WHEN l.mode='card' THEN 180 ELSE deadline.seconds END,
          'open_elapsed_ms', CASE WHEN l.mode='card' THEN (
            SELECT min(ev.elapsed_ms) FROM attempt_event ev WHERE ev.attempt_id=a.id
              AND ev.type='card.status' AND ev.payload->>'status'='received')
            ELSE NULL END,
          'primary_elapsed_ms', CASE WHEN l.mode='card' THEN (
            SELECT min(ev.elapsed_ms) FROM attempt_event ev WHERE ev.attempt_id=a.id
              AND ev.type='card.status' AND ev.payload->>'status' IN ('accepted','rejected'))
            ELSE NULL END,
          'reviews', COALESCE((SELECT jsonb_agg(jsonb_build_object('reason', r.reason, 'result', r.result, 'created_at', r.created_at) ORDER BY r.created_at)
            FROM evaluation_review r WHERE r.attempt_id = a.id), '[]'::jsonb),
          'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', ev.type, 'count', ev.n))
            FROM (SELECT type, count(*) AS n FROM attempt_event WHERE attempt_id = a.id GROUP BY type) ev), '[]'::jsonb)
        ) AS value
        FROM lesson l
        JOIN training_group g ON g.id = l.group_id
        LEFT JOIN scenario s ON s.id = l.scenario_id
        JOIN lesson_assignment la ON la.lesson_id = l.id
        JOIN app_user u ON u.id = la.learner_id
        LEFT JOIN training_attempt a ON a.assignment_id = la.id
        LEFT JOIN attempt_evaluation e ON e.attempt_id = a.id
        LEFT JOIN LATERAL (SELECT r.result FROM evaluation_review r WHERE r.attempt_id=a.id
          ORDER BY r.created_at DESC,r.id DESC LIMIT 1) latest_review ON true
        LEFT JOIN LATERAL (
          SELECT min((criterion->>'seconds')::integer) AS seconds
          FROM jsonb_array_elements(COALESCE(s.document->'rubric','[]'::jsonb)) criterion
          WHERE criterion->>'kind' = 'deadline' AND criterion->>'action' = 'saved'
        ) deadline ON true
        WHERE l.id = $1 AND g.instructor_id = $2
        ORDER BY u.login,a.created_at
        """, Tuple.of(lesson, actor.id()))
        .map(rows -> {
          for (int i = 0; i < rows.size(); i++) {
            JsonObject row = rows.getJsonObject(i);
            JsonObject card = row.getJsonObject("card");
            JsonArray grammar = new JsonArray();
            if (card != null && !"card".equals(row.getString("mode"))) {
              for (String field : new String[] {"description", "address", "caller_name", "comment"}) {
                if (card.containsKey(field)) grammar.addAll(GrammarNotes.inspect(field, card.getString(field)));
              }
            }
            row.put("grammar", grammar);
            Long elapsed = "card".equals(row.getString("mode"))
                ? row.getLong("primary_elapsed_ms") : row.getLong("elapsed_ms");
            Integer deadline = row.getInteger("deadline_seconds");
            row.put("delta_ms", elapsed != null && deadline != null
                ? elapsed - deadline * 1000L : null);
            Long opened = row.getLong("open_elapsed_ms");
            row.put("open_delta_ms", opened == null ? null : opened - 30_000L);
          }
          return rows;
        });
  }

  public Future<JsonArray> insights(Account actor) {
    instructor(actor);
    return list(pool, """
        SELECT jsonb_build_object('id',c.id,'kind',c.kind,'description',c.description,
          'failed',c.failed,'review',c.review,'total',c.total) AS value
        FROM (
          SELECT check_row.id,check_row.kind,check_row.description,
            count(*) FILTER (WHERE check_row.status = 'failed') AS failed,
            count(*) FILTER (WHERE check_row.status = 'review') AS review,
            count(*) AS total
          FROM attempt_evaluation e
          JOIN training_attempt a ON a.id = e.attempt_id
          JOIN lesson_assignment la ON la.id = a.assignment_id
          JOIN lesson l ON l.id = la.lesson_id
          JOIN training_group g ON g.id = l.group_id
          CROSS JOIN LATERAL jsonb_to_recordset(e.result->'checks')
            AS check_row(id text, kind text, description text, status text)
          WHERE g.instructor_id = $1 AND a.status = 'completed'
          GROUP BY check_row.id,check_row.kind,check_row.description
        ) c
        WHERE c.failed > 0 OR c.review > 0
        ORDER BY c.failed DESC,c.review DESC,c.description
        LIMIT 10
        """, Tuple.of(actor.id()));
  }

  public Future<JsonArray> progress(Account actor) {
    instructor(actor);
    return list(pool, """
        SELECT jsonb_build_object(
          'login', u.login,
          'attempts', count(a.id),
          'completed', count(a.id) FILTER (WHERE a.status = 'completed'),
          'failed', count(a.id) FILTER (WHERE a.status = 'failed'),
          'average_score', round(avg(COALESCE((latest_review.result->>'score')::numeric,
            (e.result->>'score')::numeric)), 2)
        ) AS value
        FROM lesson_assignment la
        JOIN lesson l ON l.id = la.lesson_id
        JOIN training_group g ON g.id = l.group_id
        JOIN app_user u ON u.id = la.learner_id
        LEFT JOIN training_attempt a ON a.assignment_id = la.id
        LEFT JOIN attempt_evaluation e ON e.attempt_id = a.id
        LEFT JOIN LATERAL (SELECT r.result FROM evaluation_review r WHERE r.attempt_id=a.id
          ORDER BY r.created_at DESC,r.id DESC LIMIT 1) latest_review ON true
        WHERE g.instructor_id = $1
        GROUP BY u.id, u.login
        ORDER BY u.login
        """, Tuple.of(actor.id()));
  }

  public Future<JsonArray> learnerHistory(Account actor) {
    if (!"user".equals(actor.role())) throw forbidden();
    return list(pool, """
        SELECT jsonb_build_object(
          'attempt_id',a.id,'title',COALESCE(a.card_template->>'title',l.card_template->>'title',s.title),
          'mode',l.mode,'status',a.status,'finished_at',a.finished_at,
          'score',CASE WHEN a.status='failed' AND latest_review.result IS NULL THEN NULL
            ELSE COALESCE(latest_review.result->'score',e.result->'score') END,
          'checks',CASE WHEN a.status='failed' THEN '[]'::jsonb ELSE COALESCE(e.result->'checks','[]'::jsonb) END,
          'recommendations',CASE WHEN a.status='failed' THEN '[]'::jsonb ELSE COALESCE(e.result->'recommendations','[]'::jsonb) END
        ) AS value
        FROM training_attempt a
        JOIN lesson_assignment la ON la.id=a.assignment_id
        JOIN lesson l ON l.id=la.lesson_id
        LEFT JOIN scenario s ON s.id=l.scenario_id
        LEFT JOIN attempt_evaluation e ON e.attempt_id=a.id
        LEFT JOIN LATERAL (SELECT r.result FROM evaluation_review r WHERE r.attempt_id=a.id
          ORDER BY r.created_at DESC,r.id DESC LIMIT 1) latest_review ON true
        WHERE la.learner_id=$1 AND a.status IN ('completed','failed')
        ORDER BY a.finished_at DESC LIMIT 200
        """, Tuple.of(actor.id()));
  }

}
