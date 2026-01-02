import { NextRequest, NextResponse } from 'next/server';
import { io, Socket } from 'socket.io-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Execute command via socket.io (like FluxOS terminal)
 * This is more reliable than the REST appexec endpoint
 */
export async function POST(request: NextRequest) {
  const zelidauth = request.headers.get('zelidauth');

  if (!zelidauth) {
    return NextResponse.json(
      { status: 'error', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { nodeIp, appName, component, cmd } = body;

    if (!nodeIp || !appName || !cmd) {
      return NextResponse.json(
        { status: 'error', message: 'Missing required parameters: nodeIp, appName, cmd' },
        { status: 400 }
      );
    }

    // Parse zelidauth
    const params = new URLSearchParams(zelidauth);
    let zelid = params.get('zelid');
    let signature = params.get('signature');
    let loginPhrase = params.get('loginPhrase');

    if (!zelid || !signature || !loginPhrase) {
      const parts = zelidauth.split(':');
      if (parts.length >= 3) {
        zelid = parts[0];
        signature = parts[1];
        loginPhrase = parts.slice(2).join(':');
      }
    }

    const authString = zelid && signature && loginPhrase
      ? JSON.stringify({ zelid, signature, loginPhrase })
      : zelidauth;

    // Build container name (component_appName)
    const containerName = component ? `${component}_${appName}` : appName;

    // Build socket.io URL
    const [host, port = '16127'] = nodeIp.split(':');
    const dashedHost = host.replace(/\./g, '-');
    const socketUrl = `https://${dashedHost}-${port}.node.api.runonflux.io`;

    console.log('=== Socket Exec ===', new Date().toISOString());
    console.log('Container:', containerName);
    console.log('Command:', cmd);
    console.log('Socket URL:', socketUrl);

    // Execute command via socket.io
    const result = await executeViaSocket(socketUrl, authString, containerName, cmd);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error executing command:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to execute command',
      },
      { status: 500 }
    );
  }
}

interface ExecResult {
  status: 'success' | 'error';
  data?: string;
  message?: string;
}

function executeViaSocket(
  socketUrl: string,
  zelidauth: string,
  containerName: string,
  cmd: string | string[]
): Promise<ExecResult> {
  return new Promise((resolve) => {
    let output = '';
    let resolved = false;
    let socket: Socket | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let endTimeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (endTimeoutId) clearTimeout(endTimeoutId);
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
      }
    };

    const finish = (result: ExecResult) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    // Overall timeout
    timeoutId = setTimeout(() => {
      console.log('Socket exec timeout after 60s');
      finish({
        status: output ? 'success' : 'error',
        data: output || undefined,
        message: output ? undefined : 'Command timed out',
      });
    }, 60000);

    try {
      socket = io(socketUrl + '/terminal', {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: false,
      });

      socket.on('connect', () => {
        console.log('Socket connected');

        // Build command string for shell execution
        const cmdString = Array.isArray(cmd) ? cmd.join(' ') : cmd;

        // Execute command using sh -c to ensure it runs and exits
        // The terminal expects: exec(zelidauth, containerName, cmd, env, user)
        socket!.emit('exec', zelidauth, containerName, '/bin/sh', '', '');

        // Wait a bit for shell to start, then send command
        setTimeout(() => {
          if (socket && !resolved) {
            // Send the command followed by exit
            socket.emit('cmd', cmdString + ' && exit 0\n');
          }
        }, 500);
      });

      socket.on('show', (data: string) => {
        if (typeof data === 'string') {
          output += data;
          console.log('Output chunk:', data.slice(0, 200));

          // Reset end timeout on each output
          if (endTimeoutId) clearTimeout(endTimeoutId);

          // If we see the command output (not just shell prompt), wait for more
          // After 3s of no output, consider it done (longer for WP-CLI commands)
          endTimeoutId = setTimeout(() => {
            if (output.length > 0) {
              console.log('No more output after 3s, finishing');
              finish({ status: 'success', data: output });
            }
          }, 3000);
        }
      });

      socket.on('error', (err: string | Error) => {
        console.error('Socket error:', err);
        const errMsg = typeof err === 'string' ? err : err.message;
        finish({
          status: 'error',
          message: errMsg,
          data: output || undefined,
        });
      });

      socket.on('connect_error', (err: Error) => {
        console.error('Socket connect error:', err.message);
        finish({
          status: 'error',
          message: `Connection failed: ${err.message}`,
        });
      });

      socket.on('disconnect', (reason: string) => {
        console.log('Socket disconnected:', reason);
        // If we have output and disconnected, it's probably successful
        if (output) {
          finish({ status: 'success', data: output });
        } else if (!resolved) {
          finish({
            status: 'error',
            message: `Disconnected: ${reason}`,
          });
        }
      });

      socket.on('end', () => {
        console.log('Socket end event');
        finish({
          status: 'success',
          data: output,
        });
      });
    } catch (err) {
      console.error('Socket setup error:', err);
      finish({
        status: 'error',
        message: err instanceof Error ? err.message : 'Socket setup failed',
      });
    }
  });
}
