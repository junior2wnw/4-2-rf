import type { FastifyPluginAsync } from "fastify";

import {
  agentRegisterSchema,
  agentTaskClaimResponseSchema,
  agentTaskClaimSchema,
  agentTaskCompleteSchema,
  heartbeatSchema,
} from "@4-2/contracts";

import { renderCompletedAgentTaskMessage } from "../lib/agent-task-content.js";

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/agents/register", async (request, reply) => {
    const body = agentRegisterSchema.parse(request.body);

    try {
      const registration = await app.services.repository.createAgentRegistration(body);
      reply.code(201);
      return {
        agentId: registration.agentId,
        heartbeatIntervalSeconds: 30,
        heartbeatToken: registration.heartbeatToken,
      };
    } catch (error) {
      return reply.badRequest(error instanceof Error ? error.message : "Registration failed.");
    }
  });

  app.post("/v1/agents/heartbeat", async (request, reply) => {
    const body = heartbeatSchema.parse(request.body);
    const accepted = await app.services.repository.recordHeartbeat(body);

    if (!accepted) {
      app.services.metrics.markAgentHeartbeat("rejected");
      return reply.unauthorized("Invalid agent heartbeat token.");
    }

    app.services.metrics.markAgentHeartbeat(body.status);
    return {
      ok: true,
      now: new Date().toISOString(),
    };
  });

  app.post("/v1/agents/tasks/claim", async (request, reply) => {
    const body = agentTaskClaimSchema.parse(request.body);
    const valid = await app.services.repository.isValidAgentHeartbeat(
      body.agentId,
      body.heartbeatToken,
    );

    if (!valid) {
      return reply.unauthorized("Invalid agent heartbeat token.");
    }

    const task = await app.services.repository.claimNextAgentTask(body);
    if (task) {
      app.services.metrics.markAgentTask("claimed");
    }

    return agentTaskClaimResponseSchema.parse({
      task,
    });
  });

  app.post("/v1/agents/tasks/:taskId/complete", async (request, reply) => {
    const params = request.params as { taskId: string };
    const body = agentTaskCompleteSchema.parse(request.body);
    const valid = await app.services.repository.isValidAgentHeartbeat(
      body.agentId,
      body.heartbeatToken,
    );

    if (!valid) {
      return reply.unauthorized("Invalid agent heartbeat token.");
    }

    const taskDetails = await app.services.repository.getAgentTaskExecutionDetails({
      taskId: params.taskId,
      agentId: body.agentId,
    });

    if (!taskDetails) {
      return reply.notFound("Agent task not found.");
    }

    const assistantContent = renderCompletedAgentTaskMessage({
      title: taskDetails.title,
      summary: taskDetails.summary,
      status: body.status,
      command: taskDetails.command,
      exitCode: body.exitCode,
      stdout: body.stdout,
      stderr: body.stderr,
      startedAt: body.startedAt,
      finishedAt: body.finishedAt,
      workingDirectory: taskDetails.workingDirectory,
    });

    const updatedTask = await app.services.repository.completeAgentTask({
      ...body,
      taskId: params.taskId,
      assistantContent,
    });

    if (!updatedTask) {
      return reply.notFound("Agent task not found or already completed.");
    }

    app.services.metrics.markAgentTask(body.status);
    return {
      ok: true,
      task: updatedTask,
    };
  });
};
