import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable, Subscription } from "rxjs";
import { finalize, tap } from "rxjs/operators";
import {
  createOperationsTimingContext,
  finishOperationsTiming,
  isOperationsTimingPath,
  operationsTimingEnabled,
  roundTiming,
  runWithOperationsTiming,
  type OperationsTimingSnapshot,
} from "../performance/operations-timing";

@Injectable()
export class OperationsTimingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OperationsTimingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method?: string; originalUrl?: string; url?: string }>();
    const pathname = String(request.originalUrl ?? request.url ?? "").split("?")[0];
    if (!operationsTimingEnabled() || !isOperationsTimingPath(pathname)) {
      return next.handle();
    }

    const endpoint = `${String(request.method ?? "GET").toUpperCase()} ${pathname}`;
    const timing = createOperationsTimingContext(endpoint);
    const response = context.switchToHttp().getResponse<{
      headersSent?: boolean;
      statusCode?: number;
      setHeader(name: string, value: string): void;
    }>();
    // ResourceTiming needs this header before the response starts. The detailed
    // Server-Timing value is added when the handler completes when possible.
    if (!response.headersSent) {
      response.setHeader("Timing-Allow-Origin", "*");
    }

    return new Observable((subscriber) => {
      let subscription: Subscription | undefined;
      runWithOperationsTiming(timing, () => {
        let reported = false;
        const report = () => {
          if (reported) return;
          reported = true;
          const snapshot = finishOperationsTiming(timing);
          this.writeResponseTiming(response, snapshot);
          this.logger.debug(`[operations-timing] ${JSON.stringify({
            endpoint: snapshot.endpoint,
            statusCode: response.statusCode ?? 200,
            durationMs: roundTiming(snapshot.durationMs),
            prisma: {
              queryCount: snapshot.prisma.queryCount,
              durationMs: roundTiming(snapshot.prisma.durationMs),
              slowestQueryMs: roundTiming(snapshot.prisma.slowestQueryMs),
            },
            tenantTransaction: {
              count: snapshot.tenantTransaction.count,
              durationMs: roundTiming(snapshot.tenantTransaction.durationMs),
            },
            stages: Object.fromEntries(
              Object.entries(snapshot.stages).map(([name, stage]) => [
                name,
                { count: stage.count, durationMs: roundTiming(stage.durationMs) },
              ]),
            ),
          })}`);
        };

        subscription = next
          .handle()
          .pipe(tap({ next: report, error: report }), finalize(report))
          .subscribe(subscriber);
      });

      return () => subscription?.unsubscribe();
    });
  }

  private writeResponseTiming(
    response: { headersSent?: boolean; setHeader(name: string, value: string): void },
    snapshot: OperationsTimingSnapshot,
  ): void {
    if (response.headersSent) return;

    const fields = [
      `app;dur=${roundTiming(snapshot.durationMs)}`,
      `prisma;dur=${roundTiming(snapshot.prisma.durationMs)};desc="${snapshot.prisma.queryCount} queries"`,
      `tenant_tx;dur=${roundTiming(snapshot.tenantTransaction.durationMs)};desc="${snapshot.tenantTransaction.count} transactions"`,
    ];
    for (const [name, stage] of Object.entries(snapshot.stages)) {
      fields.push(`${name.replace(/[^a-zA-Z0-9_-]/g, "_")};dur=${roundTiming(stage.durationMs)};desc="${stage.count} calls"`);
    }
    response.setHeader("Server-Timing", fields.join(", "));
    response.setHeader("Timing-Allow-Origin", "*");
  }
}
